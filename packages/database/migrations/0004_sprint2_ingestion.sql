CREATE TABLE orbit.ingestion_runs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  integration_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'running', 'paused', 'stopped', 'completed', 'failed')),
  start_block text NOT NULL CHECK (start_block ~ '^(0|[1-9][0-9]*)$'),
  end_block text NOT NULL CHECK (end_block ~ '^(0|[1-9][0-9]*)$'),
  checkpoint_block text CHECK (checkpoint_block ~ '^(0|[1-9][0-9]*)$'),
  movement_count bigint NOT NULL DEFAULT 0 CHECK (movement_count >= 0),
  quarantine_count bigint NOT NULL DEFAULT 0 CHECK (quarantine_count >= 0),
  failure_code text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id),
  CHECK (end_block::numeric >= start_block::numeric),
  CHECK (checkpoint_block IS NULL OR checkpoint_block::numeric BETWEEN start_block::numeric AND end_block::numeric)
);

CREATE TABLE orbit.ingestion_run_leases (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  owner_id text NOT NULL CHECK (length(owner_id) > 0),
  lease_token_sha256 text NOT NULL CHECK (lease_token_sha256 ~ '^[a-f0-9]{64}$'),
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > acquired_at),
  heartbeat_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, run_id),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orbit.ingestion_runs(tenant_id, id)
);

CREATE TABLE orbit.ingestion_checkpoints (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  block_number text NOT NULL CHECK (block_number ~ '^(0|[1-9][0-9]*)$'),
  movement_count bigint NOT NULL CHECK (movement_count >= 0),
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, run_id, block_number),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orbit.ingestion_runs(tenant_id, id)
);

CREATE TABLE orbit.ingestion_quarantine (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  block_number text NOT NULL CHECK (block_number ~ '^(0|[1-9][0-9]*)$'),
  reason_code text NOT NULL CHECK (length(reason_code) > 0),
  evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, run_id, block_number, reason_code),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orbit.ingestion_runs(tenant_id, id),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id)
);

CREATE TABLE orbit.canonical_movements (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  integration_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bep20_transfer', 'native_fee')),
  chain_id text NOT NULL CHECK (chain_id IN ('56', '97')),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[a-f0-9]{64}$'),
  movement_discriminator text NOT NULL CHECK (length(movement_discriminator) > 0),
  log_index text CHECK (log_index ~ '^(0|[1-9][0-9]*)$'),
  block_number text NOT NULL CHECK (block_number ~ '^(0|[1-9][0-9]*)$'),
  block_hash text NOT NULL CHECK (block_hash ~ '^0x[a-f0-9]{64}$'),
  from_address text NOT NULL CHECK (from_address ~ '^0x[a-f0-9]{40}$'),
  to_address text CHECK (to_address ~ '^0x[a-f0-9]{40}$'),
  token_contract text CHECK (token_contract ~ '^0x[a-f0-9]{40}$'),
  quantity_atomic text NOT NULL CHECK (quantity_atomic ~ '^(0|[1-9][0-9]*)$'),
  quantity_display text CHECK (quantity_display ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'),
  decimals smallint CHECK (decimals BETWEEN 0 AND 255),
  symbol text,
  metadata_source text NOT NULL CHECK (length(metadata_source) > 0),
  evidence_ids uuid[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  parser_version text NOT NULL CHECK (length(parser_version) > 0),
  observed_state text NOT NULL CHECK (observed_state IN ('observed', 'quarantined')),
  normalized_state text NOT NULL CHECK (normalized_state IN ('normalized', 'suppressed')),
  fee_payer_source text CHECK (fee_payer_source IN ('receipt', 'transaction', 'protocol_default')),
  effective_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, integration_id, chain_id, transaction_hash, movement_discriminator),
  FOREIGN KEY (tenant_id, integration_id)
    REFERENCES orbit.integrations(tenant_id, id),
  CHECK (
    (kind = 'bep20_transfer' AND log_index IS NOT NULL AND token_contract IS NOT NULL AND to_address IS NOT NULL)
    OR (kind = 'native_fee' AND log_index IS NULL AND token_contract IS NULL)
  )
);

CREATE INDEX ingestion_runs_integration_started_idx
  ON orbit.ingestion_runs (tenant_id, integration_id, started_at DESC);
CREATE INDEX ingestion_runs_runnable_idx
  ON orbit.ingestion_runs (tenant_id, state, started_at)
  WHERE state IN ('queued', 'running', 'paused', 'failed');
CREATE INDEX ingestion_run_leases_expiry_idx
  ON orbit.ingestion_run_leases (expires_at);
CREATE INDEX ingestion_quarantine_run_idx
  ON orbit.ingestion_quarantine (tenant_id, run_id, created_at);
CREATE INDEX canonical_movements_integration_block_idx
  ON orbit.canonical_movements (tenant_id, integration_id, block_number, transaction_hash);

ALTER TABLE orbit.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.ingestion_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_runs_tenant_scope ON orbit.ingestion_runs
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.ingestion_run_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.ingestion_run_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_run_leases_tenant_scope ON orbit.ingestion_run_leases
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.ingestion_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.ingestion_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_checkpoints_tenant_scope ON orbit.ingestion_checkpoints
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.ingestion_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.ingestion_quarantine FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_quarantine_tenant_scope ON orbit.ingestion_quarantine
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

ALTER TABLE orbit.canonical_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.canonical_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY canonical_movements_tenant_scope ON orbit.canonical_movements
  USING (tenant_id = orbit.current_tenant_id())
  WITH CHECK (tenant_id = orbit.current_tenant_id());

CREATE FUNCTION orbit.reject_ingestion_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ingestion history is append-only';
END
$$;

CREATE TRIGGER ingestion_checkpoints_append_only
BEFORE UPDATE OR DELETE ON orbit.ingestion_checkpoints
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

CREATE TRIGGER ingestion_quarantine_append_only
BEFORE UPDATE OR DELETE ON orbit.ingestion_quarantine
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();

CREATE TRIGGER canonical_movements_append_only
BEFORE UPDATE OR DELETE ON orbit.canonical_movements
FOR EACH ROW EXECUTE FUNCTION orbit.reject_ingestion_history_mutation();
