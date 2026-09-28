BEGIN;

CREATE SCHEMA IF NOT EXISTS orbit;

CREATE FUNCTION orbit.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE TABLE orbit.tenants (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(display_name) > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE orbit.integrations (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  provider text NOT NULL CHECK (length(provider) > 0),
  secret_reference text,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE TABLE orbit.evidence_objects (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  integration_id uuid NOT NULL,
  provider text NOT NULL CHECK (length(provider) > 0),
  independence_group text NOT NULL CHECK (length(independence_group) > 0),
  object_uri text NOT NULL CHECK (length(object_uri) > 0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  observed_at timestamptz NOT NULL,
  effective_at timestamptz,
  schema_version text NOT NULL,
  parser_version text,
  network_anchor jsonb,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, object_uri),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id)
);

CREATE TABLE orbit.source_records (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  integration_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  external_object_type text NOT NULL CHECK (length(external_object_type) > 0),
  external_object_id text NOT NULL CHECK (length(external_object_id) > 0),
  external_revision text,
  source_lifecycle text NOT NULL CHECK (
    source_lifecycle IN ('observed', 'quarantined', 'superseded')
  ),
  schema_version text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (
    tenant_id,
    integration_id,
    external_object_type,
    external_object_id,
    external_revision,
    evidence_id
  ),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id),
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES orbit.evidence_objects(tenant_id, id)
);

CREATE TABLE orbit.ingestion_deliveries (
  tenant_id uuid NOT NULL,
  delivery_id text NOT NULL,
  integration_id uuid NOT NULL,
  evidence_id uuid,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('received', 'persisted', 'quarantined')),
  received_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, delivery_id),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id),
  FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES orbit.evidence_objects(tenant_id, id)
);

CREATE TABLE orbit.outbox_events (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  aggregate_type text NOT NULL CHECK (length(aggregate_type) > 0),
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(event_type) > 0),
  event_version text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  published_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE FUNCTION orbit.reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'evidence metadata is append-only';
END
$$;

CREATE TRIGGER evidence_objects_append_only
BEFORE UPDATE OR DELETE ON orbit.evidence_objects
FOR EACH ROW EXECUTE FUNCTION orbit.reject_evidence_mutation();

ALTER TABLE orbit.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_tenant_scope ON orbit.tenants
  USING (id = orbit.current_tenant_id())
  WITH CHECK (id = orbit.current_tenant_id());

ALTER TABLE orbit.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.integrations FORCE ROW LEVEL SECURITY;
CREATE POLICY integrations_tenant_scope ON orbit.integrations
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.evidence_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_objects_tenant_scope ON orbit.evidence_objects
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.source_records FORCE ROW LEVEL SECURITY;
CREATE POLICY source_records_tenant_scope ON orbit.source_records
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.ingestion_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.ingestion_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_deliveries_tenant_scope ON orbit.ingestion_deliveries
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_scope ON orbit.outbox_events
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

COMMIT;
