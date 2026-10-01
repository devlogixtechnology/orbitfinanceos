-- Migration 0012: Customer passwords, non-EVM wallets, and cleanups
-- 1. Relax wallet_address constraint on reconciliation_results to allow Bitcoin, Solana, Tron, and vault labels
ALTER TABLE orbit.reconciliation_results
  DROP CONSTRAINT IF EXISTS reconciliation_results_wallet_address_check;

ALTER TABLE orbit.reconciliation_results
  ADD CONSTRAINT reconciliation_results_wallet_address_check
    CHECK (length(wallet_address) > 0 AND length(wallet_address) <= 128);

-- 2. Add initial_password column to customers and auth_credentials for admin visibility
ALTER TABLE orbit.customers
  ADD COLUMN IF NOT EXISTS initial_password text;

ALTER TABLE orbit.auth_credentials
  ADD COLUMN IF NOT EXISTS initial_password text;

-- 3. Enable CSV import deletion and user/customer lifecycle cleanup
DROP TRIGGER IF EXISTS csv_imports_append_only ON orbit.csv_imports;

GRANT DELETE ON
  orbit.csv_imports,
  orbit.data_connections,
  orbit.customers,
  orbit.actors,
  orbit.actor_roles,
  orbit.memberships,
  orbit.auth_credentials,
  orbit.custom_role_assignments
TO orbitos_app;

