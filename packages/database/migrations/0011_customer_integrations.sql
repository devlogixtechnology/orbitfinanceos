ALTER TABLE orbit.customers
  ADD COLUMN email text;

ALTER TABLE orbit.actors
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT actors_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES orbit.customers(tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE orbit.data_connections
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT data_connections_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES orbit.customers(tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE orbit.integrations
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT integrations_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES orbit.customers(tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE orbit.csv_imports
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT csv_imports_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES orbit.customers(tenant_id, id)
    ON DELETE SET NULL;

ALTER TABLE orbit.reconciliation_results
  ADD COLUMN customer_id uuid,
  ADD CONSTRAINT reconciliation_results_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES orbit.customers(tenant_id, id)
    ON DELETE SET NULL;

CREATE INDEX actors_customer_idx
  ON orbit.actors (tenant_id, customer_id);

CREATE INDEX data_connections_customer_idx
  ON orbit.data_connections (tenant_id, customer_id);

CREATE INDEX integrations_customer_idx
  ON orbit.integrations (tenant_id, customer_id);

CREATE INDEX csv_imports_customer_idx
  ON orbit.csv_imports (tenant_id, customer_id);

CREATE INDEX reconciliation_results_customer_idx
  ON orbit.reconciliation_results (tenant_id, customer_id);
