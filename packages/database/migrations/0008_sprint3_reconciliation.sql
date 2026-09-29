CREATE TABLE orbit.reconciliation_results (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  wallet_address text NOT NULL CHECK (wallet_address ~ '^0x[a-f0-9]{40}$'),
  asset_id text NOT NULL CHECK (length(asset_id) > 0),
  cutoff timestamptz NOT NULL,
  policy_version text NOT NULL CHECK (length(policy_version) > 0),
  opening_quantity_atomic text NOT NULL CHECK (opening_quantity_atomic ~ '^-?(0|[1-9][0-9]*)$'),
  incoming_quantity_atomic text NOT NULL CHECK (incoming_quantity_atomic ~ '^(0|[1-9][0-9]*)$'),
  outgoing_quantity_atomic text NOT NULL CHECK (outgoing_quantity_atomic ~ '^(0|[1-9][0-9]*)$'),
  fee_quantity_atomic text NOT NULL CHECK (fee_quantity_atomic ~ '^(0|[1-9][0-9]*)$'),
  expected_closing_quantity_atomic text NOT NULL CHECK (expected_closing_quantity_atomic ~ '^-?(0|[1-9][0-9]*)$'),
  observed_closing_quantity_atomic text CHECK (observed_closing_quantity_atomic ~ '^-?(0|[1-9][0-9]*)$'),
  difference_atomic text CHECK (difference_atomic ~ '^-?(0|[1-9][0-9]*)$'),
  state text NOT NULL CHECK (state IN ('matched', 'mismatched', 'not_observed')),
  verified_movement_ids uuid[] NOT NULL,
  excluded_movement_ids uuid[] NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, wallet_address, asset_id, cutoff, policy_version)
);

CREATE TABLE orbit.operational_exceptions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  stable_key text NOT NULL CHECK (length(stable_key) > 0),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9]*(:[a-z][a-z0-9_-]*)+$'),
  severity text NOT NULL CHECK (severity IN ('warning', 'error')),
  state text NOT NULL CHECK (state IN ('open', 'investigating', 'resolved')),
  affected_resource_type text NOT NULL CHECK (affected_resource_type IN ('movement', 'reconciliation', 'integration')),
  affected_resource_id uuid NOT NULL,
  owner_actor_id uuid,
  resolution_reason_code text CHECK (resolution_reason_code ~ '^[a-z][a-z0-9]*(:[a-z][a-z0-9_-]*)+$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, stable_key),
  FOREIGN KEY (tenant_id, owner_actor_id)
    REFERENCES orbit.actors(tenant_id, id),
  CHECK (
    (state = 'resolved' AND resolution_reason_code IS NOT NULL)
    OR (state <> 'resolved' AND resolution_reason_code IS NULL)
  )
);

CREATE TABLE orbit.exception_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  exception_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9]*(:[a-z][a-z0-9_-]*)+$'),
  note text CHECK (length(note) BETWEEN 1 AND 4000),
  before_state jsonb,
  after_state jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, exception_id)
    REFERENCES orbit.operational_exceptions(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id)
);

CREATE INDEX reconciliation_results_cutoff_idx
  ON orbit.reconciliation_results (tenant_id, cutoff DESC, id);
CREATE INDEX operational_exceptions_queue_idx
  ON orbit.operational_exceptions (tenant_id, state, severity, updated_at, id);
CREATE INDEX operational_exceptions_owner_idx
  ON orbit.operational_exceptions (tenant_id, owner_actor_id, state);
CREATE INDEX exception_events_exception_idx
  ON orbit.exception_events (tenant_id, exception_id, occurred_at, id);
CREATE INDEX exception_events_actor_idx
  ON orbit.exception_events (tenant_id, actor_id);

ALTER TABLE orbit.reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.reconciliation_results FORCE ROW LEVEL SECURITY;
CREATE POLICY reconciliation_results_tenant_scope ON orbit.reconciliation_results
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.operational_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.operational_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_exceptions_tenant_scope ON orbit.operational_exceptions
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.exception_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.exception_events FORCE ROW LEVEL SECURITY;
CREATE POLICY exception_events_tenant_scope ON orbit.exception_events
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

CREATE FUNCTION orbit.enforce_exception_workflow_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id
    OR NEW.id <> OLD.id
    OR NEW.stable_key <> OLD.stable_key
    OR NEW.reason_code <> OLD.reason_code
    OR NEW.severity <> OLD.severity
    OR NEW.affected_resource_type <> OLD.affected_resource_type
    OR NEW.affected_resource_id <> OLD.affected_resource_id
    OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'exception source facts are immutable';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'exception workflow timestamp cannot move backwards';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER reconciliation_results_append_only
BEFORE UPDATE OR DELETE ON orbit.reconciliation_results
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

CREATE TRIGGER exception_events_append_only
BEFORE UPDATE OR DELETE ON orbit.exception_events
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

CREATE TRIGGER operational_exceptions_protect_facts
BEFORE UPDATE ON orbit.operational_exceptions
FOR EACH ROW EXECUTE FUNCTION orbit.enforce_exception_workflow_update();

REVOKE ALL ON FUNCTION orbit.enforce_exception_workflow_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orbit.enforce_exception_workflow_update() TO orbitos_app;

GRANT SELECT, INSERT ON orbit.reconciliation_results, orbit.exception_events TO orbitos_app;
GRANT SELECT, INSERT, UPDATE ON orbit.operational_exceptions TO orbitos_app;
