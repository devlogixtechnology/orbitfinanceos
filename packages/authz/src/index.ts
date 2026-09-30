import {
  createdSessionSchema,
  sessionContextSchema,
  type CreatedSession,
  type SessionContext,
} from "@orbitos/canonical-model";
import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

function scrypt(
  password: string,
  salt: Uint8Array,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error === null) {
        resolve(derivedKey);
      } else {
        reject(error);
      }
    });
  });
}
const passwordHashPattern = /^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/u;
const scryptParameters = {
  N: 2 ** 17,
  maxmem: 160 * 1024 * 1024,
  p: 1,
  r: 8,
} as const;
const passwordKeyLength = 64;

export interface PasswordHashOptions {
  readonly salt?: Uint8Array;
}

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  if (password.length < 12 || password.length > 128) {
    throw new RangeError("Password must contain between 12 and 128 characters");
  }

  const salt = options.salt ?? randomBytes(16);
  const derived = await scrypt(password, salt, passwordKeyLength, {
    N: scryptParameters.N,
    maxmem: scryptParameters.maxmem,
    p: scryptParameters.p,
    r: scryptParameters.r,
  });

  return [
    "$scrypt",
    `N=${scryptParameters.N},r=${scryptParameters.r},p=${scryptParameters.p}`,
    Buffer.from(salt).toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const match = passwordHashPattern.exec(encodedHash);
  if (match === null) {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawExpected] = match;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (
    N !== scryptParameters.N ||
    r !== scryptParameters.r ||
    p !== scryptParameters.p ||
    rawSalt === undefined ||
    rawExpected === undefined
  ) {
    return false;
  }

  const expected = Buffer.from(rawExpected, "base64url");
  if (expected.length !== passwordKeyLength) {
    return false;
  }
  const actual = await scrypt(
    password,
    Buffer.from(rawSalt, "base64url"),
    expected.length,
    { N, maxmem: scryptParameters.maxmem, p, r },
  );

  return timingSafeEqual(actual, expected);
}

export function digestSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface StoredCredential {
  readonly actorId: string;
  readonly email: string;
  readonly failedAuthenticationCount: number;
  readonly lockedUntil: Date | null;
  readonly passwordHash: string;
  readonly explicitPermissions?: readonly string[];
  readonly roles: readonly string[];
  readonly subject: string;
  readonly tenantDisplayName: string;
  readonly tenantId: string;
}

export interface CreateStoredSessionCommand {
  readonly actorId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly sessionId: string;
  readonly tenantId: string;
  readonly tokenDigest: string;
}

export interface CustomAuthRepository {
  createSession(command: CreateStoredSessionCommand): Promise<void>;
  findCredentialByEmail(email: string): Promise<StoredCredential | null>;
  findSessionByTokenDigest(
    tokenDigest: string,
    observedAt: Date,
  ): Promise<SessionContext | null>;
  recordAuthenticationFailure(
    credential: StoredCredential,
    failedAuthenticationCount: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  recordAuthenticationSuccess(
    credential: StoredCredential,
    authenticatedAt: Date,
  ): Promise<void>;
  revokeSession(tokenDigest: string, revokedAt: Date): Promise<void>;
}

export interface PasswordSessionServiceOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
  readonly lockDurationMilliseconds?: number;
  readonly lockThreshold?: number;
  readonly sessionDurationMilliseconds?: number;
  readonly tokenGenerator?: () => string;
}

export interface SessionLifecycleService {
  createSession(email: string, password: string): Promise<CreatedSession | null>;
  revokeSession(token: string): Promise<void>;
}

export class PasswordSessionService
  implements SessionAuthenticator, SessionLifecycleService
{
  private readonly clock: () => Date;
  private readonly dummyHash: Promise<string>;
  private readonly idGenerator: () => string;
  private readonly lockDurationMilliseconds: number;
  private readonly lockThreshold: number;
  private readonly sessionDurationMilliseconds: number;
  private readonly tokenGenerator: () => string;

  constructor(
    private readonly repository: CustomAuthRepository,
    options: PasswordSessionServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
    this.lockDurationMilliseconds = options.lockDurationMilliseconds ?? 15 * 60_000;
    this.lockThreshold = options.lockThreshold ?? 5;
    this.sessionDurationMilliseconds =
      options.sessionDurationMilliseconds ?? 8 * 60 * 60_000;
    this.tokenGenerator =
      options.tokenGenerator ?? (() => randomBytes(32).toString("base64url"));
    this.dummyHash = hashPassword(randomBytes(32).toString("base64url"));
  }

  async authenticate(bearerToken: string): Promise<SessionContext | null> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(bearerToken)) {
      return null;
    }
    return this.repository.findSessionByTokenDigest(
      digestSessionToken(bearerToken),
      this.clock(),
    );
  }

  async createSession(email: string, password: string): Promise<CreatedSession | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const credential = await this.repository.findCredentialByEmail(normalizedEmail);
    const passwordMatches = await verifyPassword(
      password,
      credential?.passwordHash ?? (await this.dummyHash),
    );
    const now = this.clock();

    if (
      credential === null ||
      !passwordMatches ||
      (credential.lockedUntil !== null && credential.lockedUntil > now)
    ) {
      if (credential !== null) {
        const failedAuthenticationCount =
          credential.failedAuthenticationCount + 1;
        const lockedUntil =
          failedAuthenticationCount >= this.lockThreshold
            ? new Date(now.getTime() + this.lockDurationMilliseconds)
            : credential.lockedUntil;
        await this.repository.recordAuthenticationFailure(
          credential,
          failedAuthenticationCount,
          lockedUntil,
        );
      }
      return null;
    }

    const token = this.tokenGenerator();
    const expiresAt = new Date(now.getTime() + this.sessionDurationMilliseconds);
    await this.repository.createSession({
      actorId: credential.actorId,
      createdAt: now,
      expiresAt,
      sessionId: this.idGenerator(),
      tenantId: credential.tenantId,
      tokenDigest: digestSessionToken(token),
    });
    await this.repository.recordAuthenticationSuccess(credential, now);

    return createdSessionSchema.parse({
      expiresAt: expiresAt.toISOString(),
      schemaVersion: "1",
      token,
    });
  }

  async revokeSession(token: string): Promise<void> {
    if (/^[A-Za-z0-9_-]{43}$/u.test(token)) {
      await this.repository.revokeSession(
        digestSessionToken(token),
        this.clock(),
      );
    }
  }
}

const operationalReadPermissions = [
  "integrations:read",
  "evidence:read",
  "ingestion:read",
  "movements:read",
  "verification:read",
  "reconciliation:read",
  "exceptions:read",
] as const;

const operationalWritePermissions = [
  "integrations:write",
  "ingestion:write",
  "reconciliation:write",
  "exceptions:write",
] as const;

const tenantAdministrationPermissions = [
  "tenants:read",
  "customers:read",
  "customers:write",
  "users:read",
  "users:write",
  "roles:read",
  "roles:write",
  "domains:read",
  "domains:write",
  "billing:read",
  "billing:write",
] as const;

export const permissionCatalog = [
  "platform:tenants:read",
  "platform:tenants:write",
  ...tenantAdministrationPermissions,
  ...operationalReadPermissions,
  ...operationalWritePermissions,
] as const;

export function permissionsForRoles(
  roles: readonly string[],
  explicitPermissions: readonly string[] = [],
): readonly string[] {
  const permissions = new Set<string>(explicitPermissions);
  for (const role of roles) {
    if (role === "super_admin") {
      for (const permission of permissionCatalog) permissions.add(permission);
    } else if (role === "tenant_admin" || role === "administrator") {
      for (const permission of tenantAdministrationPermissions) permissions.add(permission);
      for (const permission of operationalReadPermissions) permissions.add(permission);
      for (const permission of operationalWritePermissions) permissions.add(permission);
    } else if (role === "admin") {
      for (const permission of [
        "tenants:read",
        "customers:read",
        "customers:write",
        "users:read",
        "users:write",
        "roles:read",
        "domains:read",
        "billing:read",
        ...operationalReadPermissions,
        ...operationalWritePermissions,
      ]) permissions.add(permission);
    } else if (role === "user" || role === "read_only_operator") {
      for (const permission of operationalReadPermissions) permissions.add(permission);
    }
  }
  return [...permissions].sort();
}

export class InMemoryCustomAuthRepository implements CustomAuthRepository {
  private readonly credentials = new Map<string, StoredCredential>();
  private readonly sessions = new Map<string, CreateStoredSessionCommand & {
    revokedAt: Date | null;
  }>();

  constructor(credentials: readonly StoredCredential[] = []) {
    for (const credential of credentials) {
      this.credentials.set(credential.email.trim().toLowerCase(), credential);
    }
  }

  createSession(command: CreateStoredSessionCommand): Promise<void> {
    this.sessions.set(command.tokenDigest, { ...command, revokedAt: null });
    return Promise.resolve();
  }

  findCredentialByEmail(email: string): Promise<StoredCredential | null> {
    return Promise.resolve(this.credentials.get(email.trim().toLowerCase()) ?? null);
  }

  findSessionByTokenDigest(
    tokenDigest: string,
    observedAt: Date,
  ): Promise<SessionContext | null> {
    const session = this.sessions.get(tokenDigest);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.expiresAt <= observedAt
    ) {
      return Promise.resolve(null);
    }
    const credential = [...this.credentials.values()].find(
      (candidate) =>
        candidate.actorId === session.actorId &&
        candidate.tenantId === session.tenantId,
    );
    if (credential === undefined) {
      return Promise.resolve(null);
    }

    return Promise.resolve(
      sessionContextSchema.parse({
        actor: {
          actorId: credential.actorId,
          subject: credential.subject,
        },
        authenticatedAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        permissions: permissionsForRoles(
          credential.roles,
          credential.explicitPermissions,
        ),
        roles: credential.roles,
        schemaVersion: "1",
        tenant: {
          displayName: credential.tenantDisplayName,
          tenantId: credential.tenantId,
        },
      }),
    );
  }

  recordAuthenticationFailure(
    credential: StoredCredential,
    failedAuthenticationCount: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    this.credentials.set(credential.email, {
      ...credential,
      failedAuthenticationCount,
      lockedUntil,
    });
    return Promise.resolve();
  }

  recordAuthenticationSuccess(
    credential: StoredCredential,
    authenticatedAt: Date,
  ): Promise<void> {
    void authenticatedAt;
    this.credentials.set(credential.email, {
      ...credential,
      failedAuthenticationCount: 0,
      lockedUntil: null,
    });
    return Promise.resolve();
  }

  revokeSession(tokenDigest: string, revokedAt: Date): Promise<void> {
    const session = this.sessions.get(tokenDigest);
    if (session !== undefined) {
      this.sessions.set(tokenDigest, { ...session, revokedAt });
    }
    return Promise.resolve();
  }
}

export interface SessionAuthenticator {
  authenticate(bearerToken: string): Promise<SessionContext | null>;
}

export const denyAllAuthenticator: SessionAuthenticator = {
  authenticate: () => Promise.resolve(null),
};

export function readBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (authorizationHeader === undefined) {
    return undefined;
  }

  const match = /^Bearer ([^\s]+)$/iu.exec(authorizationHeader);
  return match?.[1];
}

export function validateSessionContext(value: unknown): SessionContext {
  return sessionContextSchema.parse(value);
}

export function hasPermission(
  session: SessionContext,
  permission: string,
): boolean {
  return session.permissions.includes(permission);
}
