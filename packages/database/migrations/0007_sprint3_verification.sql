CREATE TABLE orbit.verification_policies (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  version text NOT NULL CHECK (length(version) > 0),
  minimum_independent_providers smallint NOT NULL
    CHECK (minimum_independent_providers BETWEEN 2 AND 4),
  finality_mode text NOT NULL
    CHECK (finality_mode IN ('confirmations', 'safe_tag', 'finalized_tag')),
  minimum_confirmations bigint CHECK (minimum_confirmations > 0),
  require_inclusion boolean NOT NULL,
  require_execution boolean NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, version),
  CHECK (
    (finality_mode = 'confirmations' AND minimum_confirmations IS NOT NULL)
    OR (finality_mode <> 'confirmations' AND minimum_confirmations IS NULL)
  )
);

CREATE TABLE orbit.verification_decisions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  movement_id uuid NOT NULL,
  policy_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (length(policy_version) > 0),
  supersedes_decision_id uuid,
  verification_state text NOT NULL
    CHECK (verification_state IN ('pending', 'verified', 'degraded', 'conflicted', 'superseded', 'invalidated')),
  inclusion_state text NOT NULL
    CHECK (inclusion_state IN ('unknown', 'pending', 'included', 'not_included')),
  execution_state text NOT NULL
    CHECK (execution_state IN ('unknown', 'succeeded', 'failed')),
  finality_state text NOT NULL
    CHECK (finality_state IN ('unknown', 'pending', 'final', 'orphaned')),
  agreement_state text NOT NULL
    CHECK (agreement_state IN ('unavailable', 'pending', 'agreed', 'degraded', 'conflicted')),
  observations jsonb NOT NULL CHECK (jsonb_typeof(observations) = 'array' AND jsonb_array_length(observations) > 0),
  evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  reason_codes text[] NOT NULL CHECK (cardinality(reason_codes) > 0),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, movement_id)
    REFERENCES orbit.canonical_movements(tenant_id, id),
  FOREIGN KEY (tenant_id, policy_id)
    REFERENCES orbit.verification_policies(tenant_id, id),
  FOREIGN KEY (tenant_id, supersedes_decision_id)
    REFERENCES orbit.verification_decisions(tenant_id, id),
  UNIQUE (tenant_id, supersedes_decision_id),
  CHECK (supersedes_decision_id IS NULL OR supersedes_decision_id <> id)
);

CREATE INDEX verification_decisions_movement_decided_idx
  ON orbit.verification_decisions (tenant_id, movement_id, decided_at DESC, id DESC);
CREATE INDEX verification_decisions_policy_idx
  ON orbit.verification_decisions (tenant_id, policy_id);
CREATE INDEX verification_decisions_state_idx
  ON orbit.verification_decisions (tenant_id, verification_state, decided_at DESC);

ALTER TABLE orbit.verification_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.verification_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY verification_policies_tenant_scope ON orbit.verification_policies
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.verification_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.verification_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY verification_decisions_tenant_scope ON orbit.verification_decisions
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

CREATE FUNCTION orbit.enforce_verification_decision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  policy orbit.verification_policies%ROWTYPE;
  previous orbit.verification_decisions%ROWTYPE;
  transition_allowed boolean := false;
BEGIN
  SELECT * INTO STRICT policy
  FROM orbit.verification_policies
  WHERE tenant_id = NEW.tenant_id AND id = NEW.policy_id;

  IF NEW.policy_version <> policy.version THEN
    RAISE EXCEPTION 'verification policy version does not match policy record';
  END IF;

  IF NEW.verification_state = 'verified' AND (
    NEW.agreement_state <> 'agreed'
    OR NEW.finality_state <> 'final'
    OR (policy.require_inclusion AND NEW.inclusion_state <> 'included')
    OR (policy.require_execution AND NEW.execution_state <> 'succeeded')
  ) THEN
    RAISE EXCEPTION 'verified decision requires every mandatory policy dimension to pass';
  END IF;

  IF NEW.supersedes_decision_id IS NULL THEN
    IF NEW.verification_state IN ('superseded', 'invalidated') THEN
      RAISE EXCEPTION 'terminal verification state requires a prior decision';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO STRICT previous
  FROM orbit.verification_decisions
  WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_decision_id;

  IF previous.movement_id <> NEW.movement_id THEN
    RAISE EXCEPTION 'verification decisions may supersede only the same movement';
  END IF;

  transition_allowed := CASE previous.verification_state
    WHEN 'pending' THEN NEW.verification_state IN ('verified', 'degraded', 'conflicted', 'invalidated')
    WHEN 'degraded' THEN NEW.verification_state IN ('pending', 'verified', 'conflicted', 'invalidated')
    WHEN 'verified' THEN NEW.verification_state IN ('superseded', 'invalidated')
    WHEN 'conflicted' THEN NEW.verification_state IN ('pending', 'superseded', 'invalidated')
    ELSE false
  END;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'illegal verification transition from % to %',
      previous.verification_state, NEW.verification_state;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER verification_decisions_validate
BEFORE INSERT ON orbit.verification_decisions
FOR EACH ROW EXECUTE FUNCTION orbit.enforce_verification_decision();

CREATE TRIGGER verification_policies_append_only
BEFORE UPDATE OR DELETE ON orbit.verification_policies
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

CREATE TRIGGER verification_decisions_append_only
BEFORE UPDATE OR DELETE ON orbit.verification_decisions
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

REVOKE ALL ON FUNCTION orbit.enforce_verification_decision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orbit.enforce_verification_decision() TO orbitos_app;

GRANT SELECT, INSERT ON
  orbit.verification_policies,
  orbit.verification_decisions
TO orbitos_app;
