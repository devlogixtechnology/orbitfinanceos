CREATE TABLE orbit.auth_credentials (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  email text NOT NULL CHECK (
    email = lower(email)
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  password_hash text NOT NULL CHECK (password_hash LIKE '$scrypt$%'),
  enabled boolean NOT NULL DEFAULT true,
  failed_authentication_count integer NOT NULL DEFAULT 0
    CHECK (failed_authentication_count >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_authenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (tenant_id, actor_id),
  UNIQUE (email),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id)
);

CREATE TABLE orbit.auth_sessions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  actor_id uuid NOT NULL,
  token_sha256 text NOT NULL CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  last_seen_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (token_sha256),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES orbit.actors(tenant_id, id)
);

CREATE INDEX auth_sessions_active_digest_idx
  ON orbit.auth_sessions (token_sha256, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE orbit.auth_credentials IS
  'Pre-authentication identity boundary. Passwords are stored only as versioned memory-hard hashes.';
COMMENT ON TABLE orbit.auth_sessions IS
  'Opaque browser/API sessions. Only SHA-256 token digests are persisted.';
