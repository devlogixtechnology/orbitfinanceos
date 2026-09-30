CREATE TABLE orbit.data_connections (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('quickbooks', 'fireblocks')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured', 'disabled')),
  public_configuration jsonb NOT NULL CHECK (jsonb_typeof(public_configuration) = 'object'),
  secret_reference text NOT NULL CHECK (length(secret_reference) BETWEEN 3 AND 200),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, provider, display_name)
);

CREATE TABLE orbit.csv_imports (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
  object_uri text NOT NULL CHECK (length(object_uri) > 0),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length > 0),
  row_count bigint NOT NULL CHECK (row_count > 0),
  status text NOT NULL DEFAULT 'preserved' CHECK (status = 'preserved'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, payload_sha256)
);

CREATE INDEX data_connections_provider_idx
  ON orbit.data_connections (tenant_id, provider, created_at DESC);
CREATE INDEX csv_imports_created_idx
  ON orbit.csv_imports (tenant_id, created_at DESC, id DESC);

ALTER TABLE orbit.data_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.data_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY data_connections_tenant_scope ON orbit.data_connections
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.csv_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.csv_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY csv_imports_tenant_scope ON orbit.csv_imports
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

CREATE TRIGGER csv_imports_append_only
BEFORE UPDATE OR DELETE ON orbit.csv_imports
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

GRANT SELECT, INSERT, UPDATE ON orbit.data_connections TO orbitos_app;
GRANT SELECT, INSERT ON orbit.csv_imports TO orbitos_app;
