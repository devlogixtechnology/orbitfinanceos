DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orbitos_app') THEN
    CREATE ROLE orbitos_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA orbit FROM PUBLIC;
GRANT USAGE ON SCHEMA orbit TO orbitos_app;

REVOKE ALL ON ALL TABLES IN SCHEMA orbit FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE ON
  orbit.tenants,
  orbit.actors,
  orbit.memberships,
  orbit.auth_credentials,
  orbit.integrations,
  orbit.ingestion_deliveries,
  orbit.outbox_events,
  orbit.ingestion_runs
TO orbitos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  orbit.auth_sessions,
  orbit.ingestion_run_leases
TO orbitos_app;

GRANT SELECT, INSERT ON
  orbit.evidence_objects,
  orbit.source_records,
  orbit.audit_events,
  orbit.ingestion_checkpoints,
  orbit.ingestion_quarantine,
  orbit.canonical_movements
TO orbitos_app;

REVOKE ALL ON FUNCTION orbit.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION orbit.reject_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION orbit.reject_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION orbit.reject_ingestion_history_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orbit.current_tenant_id() TO orbitos_app;
