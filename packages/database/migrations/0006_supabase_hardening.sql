ALTER FUNCTION orbit.current_tenant_id()
  SET search_path = pg_catalog;
ALTER FUNCTION orbit.reject_evidence_mutation()
  SET search_path = pg_catalog;
ALTER FUNCTION orbit.reject_audit_mutation()
  SET search_path = pg_catalog;
ALTER FUNCTION orbit.reject_ingestion_history_mutation()
  SET search_path = pg_catalog;

CREATE INDEX audit_events_actor_idx
  ON orbit.audit_events (tenant_id, actor_id);
CREATE INDEX auth_sessions_actor_idx
  ON orbit.auth_sessions (tenant_id, actor_id);
CREATE INDEX evidence_objects_integration_idx
  ON orbit.evidence_objects (tenant_id, integration_id);
CREATE INDEX ingestion_deliveries_evidence_idx
  ON orbit.ingestion_deliveries (tenant_id, evidence_id);
CREATE INDEX ingestion_deliveries_integration_idx
  ON orbit.ingestion_deliveries (tenant_id, integration_id);
CREATE INDEX ingestion_quarantine_integration_idx
  ON orbit.ingestion_quarantine (tenant_id, integration_id);
CREATE INDEX source_records_evidence_idx
  ON orbit.source_records (tenant_id, evidence_id);
