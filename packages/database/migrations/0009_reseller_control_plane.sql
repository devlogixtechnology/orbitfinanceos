CREATE FUNCTION orbit.current_platform_access()
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(nullif(current_setting('app.platform_access', true), '')::boolean, false)
$$;

ALTER TABLE orbit.tenants
  ADD COLUMN slug text,
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended'));

UPDATE orbit.tenants
SET slug = left(coalesce(
    nullif(trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'tenant'
  ), 52)
  || '-' || left(id::text, 8)
WHERE slug IS NULL;

ALTER TABLE orbit.tenants
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT tenants_slug_format CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);

ALTER TABLE orbit.actors
  ADD COLUMN display_name text;

UPDATE orbit.actors
SET display_name = left(
  CASE WHEN length(external_subject) < 2 THEN external_subject || '_' ELSE external_subject END,
  120
)
WHERE display_name IS NULL;

ALTER TABLE orbit.actors
  ALTER COLUMN display_name SET NOT NULL,
  ADD CONSTRAINT actors_display_name_length CHECK (
    length(display_name) BETWEEN 2 AND 120
  );

ALTER TABLE orbit.memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE orbit.memberships ADD CONSTRAINT memberships_role_check CHECK (
  role IN (
    'super_admin',
    'tenant_admin',
    'admin',
    'user',
    'administrator',
    'read_only_operator'
  )
);

DROP POLICY tenants_tenant_scope ON orbit.tenants;
CREATE POLICY tenants_authorized_scope ON orbit.tenants
  USING (id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (id = orbit.current_tenant_id() OR orbit.current_platform_access());

DROP POLICY actors_tenant_scope ON orbit.actors;
CREATE POLICY actors_authorized_scope ON orbit.actors
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

DROP POLICY memberships_tenant_scope ON orbit.memberships;
CREATE POLICY memberships_authorized_scope ON orbit.memberships
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

CREATE TABLE orbit.customers (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  external_reference text NOT NULL CHECK (length(external_reference) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, external_reference),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE TABLE orbit.tenant_domains (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  hostname text NOT NULL CHECK (
    length(hostname) BETWEEN 3 AND 253
    AND hostname = lower(hostname)
    AND hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  kind text NOT NULL CHECK (kind IN ('platform_subdomain', 'custom')),
  status text NOT NULL DEFAULT 'pending_dns'
    CHECK (status IN ('pending_dns', 'verified', 'active', 'failed')),
  verification_token text NOT NULL CHECK (length(verification_token) >= 16),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (hostname),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE TABLE orbit.custom_roles (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id)
);

CREATE TABLE orbit.custom_role_permissions (
  tenant_id uuid NOT NULL,
  role_id uuid NOT NULL,
  permission text NOT NULL CHECK (
    permission ~ '^[a-z][a-z0-9]*(:[a-z][a-z0-9_-]*)+$'
  ),
  PRIMARY KEY (tenant_id, role_id, permission),
  FOREIGN KEY (tenant_id, role_id)
    REFERENCES orbit.custom_roles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE orbit.custom_role_assignments (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, actor_id, role_id),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, role_id)
    REFERENCES orbit.custom_roles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE orbit.billing_subscriptions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  customer_id uuid,
  billing_kind text NOT NULL
    CHECK (billing_kind IN ('platform_to_tenant', 'tenant_to_customer')),
  plan_code text NOT NULL CHECK (plan_code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  plan_name text NOT NULL CHECK (length(plan_name) BETWEEN 2 AND 120),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  interval text NOT NULL CHECK (interval IN ('monthly', 'annual')),
  status text NOT NULL
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  next_billing_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES orbit.customers(tenant_id, id),
  CHECK (
    (billing_kind = 'platform_to_tenant' AND customer_id IS NULL)
    OR (billing_kind = 'tenant_to_customer' AND customer_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_subscriptions_platform_tenant_unique
  ON orbit.billing_subscriptions (tenant_id)
  WHERE billing_kind = 'platform_to_tenant' AND status <> 'cancelled';
CREATE UNIQUE INDEX billing_subscriptions_customer_unique
  ON orbit.billing_subscriptions (tenant_id, customer_id)
  WHERE billing_kind = 'tenant_to_customer' AND status <> 'cancelled';

CREATE TABLE orbit.billing_invoices (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  customer_id uuid,
  billing_kind text NOT NULL
    CHECK (billing_kind IN ('platform_to_tenant', 'tenant_to_customer')),
  invoice_number text NOT NULL CHECK (length(invoice_number) BETWEEN 2 AND 80),
  amount_due_minor bigint NOT NULL CHECK (amount_due_minor >= 0),
  amount_paid_minor bigint NOT NULL DEFAULT 0
    CHECK (amount_paid_minor >= 0 AND amount_paid_minor <= amount_due_minor),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, invoice_number),
  FOREIGN KEY (tenant_id) REFERENCES orbit.tenants(id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES orbit.customers(tenant_id, id),
  CHECK (
    (billing_kind = 'platform_to_tenant' AND customer_id IS NULL)
    OR (billing_kind = 'tenant_to_customer' AND customer_id IS NOT NULL)
  )
);

ALTER TABLE orbit.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_authorized_scope ON orbit.customers
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.tenant_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_domains_authorized_scope ON orbit.tenant_domains
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.custom_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY custom_roles_authorized_scope ON orbit.custom_roles
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.custom_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.custom_role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY custom_role_permissions_authorized_scope ON orbit.custom_role_permissions
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.custom_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.custom_role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY custom_role_assignments_authorized_scope ON orbit.custom_role_assignments
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.billing_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_subscriptions_authorized_scope ON orbit.billing_subscriptions
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

ALTER TABLE orbit.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit.billing_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_invoices_authorized_scope ON orbit.billing_invoices
  USING (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access())
  WITH CHECK (tenant_id = orbit.current_tenant_id() OR orbit.current_platform_access());

CREATE INDEX customers_tenant_id_idx ON orbit.customers (tenant_id);
CREATE INDEX tenant_domains_tenant_id_idx ON orbit.tenant_domains (tenant_id);
CREATE INDEX custom_role_assignments_actor_idx
  ON orbit.custom_role_assignments (tenant_id, actor_id);
CREATE INDEX custom_role_assignments_role_idx
  ON orbit.custom_role_assignments (tenant_id, role_id);
CREATE INDEX billing_subscriptions_customer_idx
  ON orbit.billing_subscriptions (tenant_id, customer_id);
CREATE INDEX billing_invoices_customer_idx
  ON orbit.billing_invoices (tenant_id, customer_id);

REVOKE ALL ON FUNCTION orbit.current_platform_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orbit.current_platform_access() TO orbitos_app;

GRANT SELECT, INSERT, UPDATE ON
  orbit.customers,
  orbit.tenant_domains,
  orbit.custom_roles,
  orbit.custom_role_permissions,
  orbit.custom_role_assignments,
  orbit.billing_subscriptions,
  orbit.billing_invoices
TO orbitos_app;
