ALTER TABLE orbit.integrations
  ADD COLUMN network_family text NOT NULL DEFAULT 'evm'
    CHECK (network_family = 'evm'),
  ADD COLUMN chain_id text NOT NULL DEFAULT '97'
    CHECK (chain_id IN ('56', '97')),
  ADD COLUMN starting_block text NOT NULL DEFAULT '0'
    CHECK (starting_block ~ '^(0|[1-9][0-9]*)$'),
  ADD COLUMN finality_policy_version text NOT NULL DEFAULT 'unconfigured'
    CHECK (length(finality_policy_version) > 0),
  ADD COLUMN provider_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN wallet_addresses text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN token_contracts text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN enabled boolean NOT NULL DEFAULT true;

CREATE TABLE orbit.actors (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  external_subject text NOT NULL CHECK (length(external_subject) > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, external_subject),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE TABLE orbit.memberships (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('administrator', 'read_only_operator')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, actor_id, role),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id)
);

CREATE TABLE orbit.audit_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (length(action) > 0),
  resource_type text NOT NULL CHECK (length(resource_type) > 0),
  resource_id uuid NOT NULL,
  correlation_id text NOT NULL CHECK (length(correlation_id) > 0),
  before_state jsonb,
  after_state jsonb,
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id)
);

CREATE FUNCTION orbit.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON orbit.audit_events
FOR EACH ROW EXECUTE FUNCTION orbit.reject_audit_mutation();

ALTER TABLE orbit.actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.actors FORCE ROW LEVEL SECURITY;
CREATE POLICY actors_tenant_scope ON orbit.actors
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_tenant_scope ON orbit.memberships
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_scope ON orbit.audit_events
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());
