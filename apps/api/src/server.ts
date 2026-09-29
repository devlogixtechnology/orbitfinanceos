import {
  denyAllAuthenticator,
  hasPermission,
  readBearerToken,
  validateSessionContext,
  type SessionLifecycleService,
  type SessionAuthenticator,
} from "@orbitos/authz";
import {
  apiErrorSchema,
  canonicalChainMovementSchema,
  createPositionReconciliationRequestSchema,
  createIngestionRunRequestSchema,
  createdSessionSchema,
  createIntegrationRequestSchema,
  integrationListSchema,
  integrationSchema,
  ingestionRunListSchema,
  ingestionRunSchema,
  movementListSchema,
  operationalExceptionListSchema,
  operationalExceptionSchema,
  positionReconciliationListSchema,
  positionReconciliationSchema,
  signInRequestSchema,
  updateOperationalExceptionRequestSchema,
  updateIntegrationRequestSchema,
  uuidSchema,
  verificationDecisionListSchema,
  type SessionContext,
} from "@orbitos/canonical-model";
import {
  IntegrationRepositoryUnavailableError,
  unavailableIntegrationRepository,
  type IntegrationRepository,
} from "@orbitos/integration-core";
import {
  IngestionUnavailableError,
  unavailableIngestionService,
  type IngestionService,
} from "@orbitos/ingestion-core";
import {
  ReconciliationUnavailableError,
  unavailableReconciliationQueryService,
  unavailableReconciliationRunner,
  type ReconciliationQueryService,
  type ReconciliationRunner,
} from "@orbitos/reconciliation-core";
import {
  VerificationUnavailableError,
  unavailableVerificationDecisionStore,
  type VerificationDecisionStore,
} from "@orbitos/verification-core";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { randomUUID } from "node:crypto";

import {
  evaluateReadiness,
  OperabilityMetrics,
  type ReadinessCheck,
} from "./operability.js";

export interface BuildServerOptions {
  readonly apiRateLimit?: {
    readonly maximumRequests: number;
    readonly windowMilliseconds: number;
  };
  readonly authenticator?: SessionAuthenticator;
  readonly ingestionService?: IngestionService;
  readonly integrationRepository?: IntegrationRepository;
  readonly reconciliationService?: ReconciliationQueryService;
  readonly reconciliationRunner?: ReconciliationRunner;
  readonly maximumIngestionBlockSpan?: bigint;
  readonly readinessChecks?: readonly ReadinessCheck[];
  readonly requestBodyLimitBytes?: number;
  readonly signInRateLimit?: {
    readonly maximumAttempts: number;
    readonly windowMilliseconds: number;
  };
  readonly sessionService?: SessionLifecycleService;
  readonly verificationStore?: VerificationDecisionStore;
}

function sendError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503,
  code: string,
  message: string,
): FastifyReply {
  return reply.status(statusCode).send(
    apiErrorSchema.parse({
      error: {
        code,
        message,
        requestId: reply.request.id,
      },
    }),
  );
}

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

function requestIdFromHeader(header: string | string[] | undefined): string {
  return typeof header === "string" && requestIdPattern.test(header) ? header : randomUUID();
}

function consumeRateLimit(
  attempts: Map<string, { count: number; resetsAt: number }>,
  key: string,
  maximumAttempts: number,
  windowMilliseconds: number,
  now: number,
): { allowed: boolean; resetsAt: number } {
  const current = attempts.get(key);
  const next = current === undefined || current.resetsAt <= now
    ? { count: 1, resetsAt: now + windowMilliseconds }
    : { count: current.count + 1, resetsAt: current.resetsAt };
  attempts.set(key, next);
  if (attempts.size > 10_000) {
    for (const [candidate, value] of attempts) {
      if (value.resetsAt <= now) attempts.delete(candidate);
    }
    while (attempts.size > 10_000) {
      const oldest = attempts.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      attempts.delete(oldest);
    }
  }
  return { allowed: next.count <= maximumAttempts, resetsAt: next.resetsAt };
}

async function resolveSession(
  request: FastifyRequest,
  reply: FastifyReply,
  authenticator: SessionAuthenticator,
): Promise<SessionContext | undefined> {
  const token = readBearerToken(request.headers.authorization);
  if (token === undefined) {
    sendError(
      reply,
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid Bearer credential is required.",
    );
    return undefined;
  }

  let identityProviderSession;
  try {
    identityProviderSession = await authenticator.authenticate(token);
  } catch (error) {
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Identity provider authentication failed",
    );
    sendError(
      reply,
      503,
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is temporarily unavailable.",
    );
    return undefined;
  }

  if (identityProviderSession === null) {
    sendError(
      reply,
      401,
      "INVALID_CREDENTIAL",
      "The supplied credential is invalid or expired.",
    );
    return undefined;
  }

  try {
    return validateSessionContext(identityProviderSession);
  } catch (error) {
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Identity provider returned an invalid session",
    );
    sendError(
      reply,
      500,
      "INVALID_SESSION_CONTEXT",
      "Authentication did not produce a valid tenant context.",
    );
    return undefined;
  }
}

function requirePermission(
  session: SessionContext,
  permission: string,
  reply: FastifyReply,
): boolean {
  if (hasPermission(session, permission)) {
    return true;
  }

  sendError(
    reply,
    403,
    "PERMISSION_DENIED",
    "The authenticated session is not permitted to perform this action.",
  );
  return false;
}

function sendRepositoryError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof IntegrationRepositoryUnavailableError) {
    return sendError(
      reply,
      503,
      "PERSISTENCE_UNAVAILABLE",
      "Durable integration persistence is not configured.",
    );
  }

  request.log.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "Integration repository operation failed",
  );
  return sendError(
    reply,
    500,
    "INTERNAL_ERROR",
    "The integration operation could not be completed.",
  );
}

function sendIngestionError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
  operation: string,
): FastifyReply {
  if (error instanceof IngestionUnavailableError) {
    return sendError(
      reply,
      503,
      "PERSISTENCE_UNAVAILABLE",
      "Ingestion persistence is not configured.",
    );
  }
  request.log.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    `Ingestion ${operation} failed`,
  );
  return sendError(reply, 500, "INGESTION_FAILED", "The ingestion operation could not be completed.");
}

function sendControlError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof VerificationUnavailableError || error instanceof ReconciliationUnavailableError) {
    return sendError(reply, 503, "PERSISTENCE_UNAVAILABLE", "Control persistence is not configured.");
  }
  if (error instanceof TypeError) {
    return sendError(reply, 409, "INVALID_WORKFLOW_TRANSITION", error.message);
  }
  request.log.error(
    { errorName: error instanceof Error ? error.name : "UnknownError" },
    "Control operation failed",
  );
  return sendError(reply, 500, "CONTROL_OPERATION_FAILED", "The control operation could not be completed.");
}

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const apiRateLimit = options.apiRateLimit ?? {
    maximumRequests: 300,
    windowMilliseconds: 60_000,
  };
  const authenticator = options.authenticator ?? denyAllAuthenticator;
  const integrationRepository =
    options.integrationRepository ?? unavailableIntegrationRepository;
  const ingestionService = options.ingestionService ?? unavailableIngestionService;
  const reconciliationService = options.reconciliationService ?? unavailableReconciliationQueryService;
  const reconciliationRunner = options.reconciliationRunner ?? unavailableReconciliationRunner;
  const verificationStore = options.verificationStore ?? unavailableVerificationDecisionStore;
  const sessionService = options.sessionService;
  const maximumIngestionBlockSpan = options.maximumIngestionBlockSpan ?? 2_000n;
  const readinessChecks = options.readinessChecks ?? [
    { check: () => Promise.reject(new Error("Database is not configured")), name: "database" },
    { check: () => Promise.reject(new Error("Object store is not configured")), name: "object_store" },
    { check: () => Promise.reject(new Error("Providers are not configured")), name: "providers" },
  ] satisfies readonly ReadinessCheck[];
  const signInRateLimit = options.signInRateLimit ?? {
    maximumAttempts: 10,
    windowMilliseconds: 60_000,
  };
  const signInAttempts = new Map<string, { count: number; resetsAt: number }>();
  const apiAttempts = new Map<string, { count: number; resetsAt: number }>();
  const loggedDependencyStatuses = new Map<string, "degraded" | "ok" | "unavailable">();
  const metrics = new OperabilityMetrics();
  const server = Fastify({
    bodyLimit: options.requestBodyLimitBytes ?? 65_536,
    genReqId: (request) => requestIdFromHeader(request.headers["x-request-id"]),
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "req.body.password",
        "req.body.secret",
        "req.body.secretKey",
      ],
    },
  });

  server.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
    if (!request.url.startsWith("/v1/")) return;
    const result = consumeRateLimit(
      apiAttempts,
      request.ip,
      apiRateLimit.maximumRequests,
      apiRateLimit.windowMilliseconds,
      Date.now(),
    );
    if (result.allowed) return;
    reply.header("Retry-After", Math.max(1, Math.ceil((result.resetsAt - Date.now()) / 1_000)));
    return sendError(reply, 429, "RATE_LIMITED", "Too many requests. Please try again later.");
  });

  server.addHook("onResponse", async (request, reply) => {
    metrics.recordRequest(
      request.method,
      request.routeOptions.url ?? "unmatched",
      reply.statusCode,
      reply.elapsedTime,
    );
  });

  server.setErrorHandler((error, request, reply) => {
    const errorStatusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
    if (errorStatusCode === 413) {
      return sendError(reply, 413, "PAYLOAD_TOO_LARGE", "The request payload exceeds the configured limit.");
    }
    request.log.error(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Unhandled API request failure",
    );
    return sendError(reply, 500, "INTERNAL_ERROR", "The request could not be completed.");
  });

  server.get("/health", () => ({
    name: "OrbitOS API",
    status: "ok",
  }));

  server.get("/ready", async (request, reply) => {
    const readiness = await evaluateReadiness(readinessChecks);
    for (const check of readiness.checks) {
      metrics.recordDependency(check.name, check.status);
      const previousStatus = loggedDependencyStatuses.get(check.name);
      if (check.status === previousStatus) continue;
      loggedDependencyStatuses.set(check.name, check.status);
      if (check.status === "unavailable") {
        request.log.error({ dependency: check.name }, "Required dependency is unavailable");
      } else if (check.status === "degraded") {
        request.log.warn({ dependency: check.name }, "Dependency redundancy is degraded");
      } else if (previousStatus !== undefined) {
        request.log.info({ dependency: check.name }, "Dependency recovered");
      }
    }
    return reply.status(readiness.status === "ready" ? 200 : 503).send({
      ...readiness,
      name: "OrbitOS API",
    });
  });

  server.get("/metrics", (_request, reply) => reply
    .type("text/plain; version=0.0.4; charset=utf-8")
    .send(metrics.render()));

  server.post("/v1/auth/sessions", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    const attempts = consumeRateLimit(
      signInAttempts,
      request.ip,
      signInRateLimit.maximumAttempts,
      signInRateLimit.windowMilliseconds,
      now,
    );
    if (!attempts.allowed) {
      reply.header(
        "Retry-After",
        Math.max(1, Math.ceil((attempts.resetsAt - now) / 1_000)),
      );
      return sendError(
        reply,
        429,
        "RATE_LIMITED",
        "Too many sign-in attempts. Please try again later.",
      );
    }
    const credentials = signInRequestSchema.safeParse(request.body);
    if (!credentials.success) {
      return sendError(
        reply,
        400,
        "INVALID_REQUEST",
        "A valid email address and password are required.",
      );
    }
    if (sessionService === undefined) {
      return sendError(
        reply,
        503,
        "AUTHENTICATION_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
      );
    }

    try {
      const created = await sessionService.createSession(
        credentials.data.email,
        credentials.data.password,
      );
      if (created === null) {
        return sendError(
          reply,
          401,
          "INVALID_CREDENTIAL",
          "The supplied credentials are invalid or temporarily unavailable.",
        );
      }
      return reply.status(201).send(createdSessionSchema.parse(created));
    } catch (error) {
      request.log.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Custom authentication failed",
      );
      return sendError(
        reply,
        500,
        "INTERNAL_ERROR",
        "Authentication could not be completed.",
      );
    }
  });

  server.delete("/v1/auth/session", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const token = readBearerToken(request.headers.authorization);
    if (sessionService !== undefined && token !== undefined) {
      try {
        await sessionService.revokeSession(token);
      } catch (error) {
        request.log.error(
          { errorName: error instanceof Error ? error.name : "UnknownError" },
          "Session revocation failed",
        );
        return sendError(
          reply,
          500,
          "INTERNAL_ERROR",
          "The session could not be revoked.",
        );
      }
    }
    return reply.status(204).send();
  });

  server.get("/v1/session", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return resolveSession(request, reply, authenticator);
  });

  server.get("/v1/integrations", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (
      session === undefined ||
      !requirePermission(session, "integrations:read", reply)
    ) {
      return reply;
    }

    try {
      const integrations = await integrationRepository.listForTenant(
        session.tenant.tenantId,
      );
      return integrationListSchema.parse({
        data: integrations,
        schemaVersion: "1",
      });
    } catch (error) {
      return sendRepositoryError(request, reply, error);
    }
  });

  server.post("/v1/integrations", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (
      session === undefined ||
      !requirePermission(session, "integrations:write", reply)
    ) {
      return reply;
    }

    const configuration = createIntegrationRequestSchema.safeParse(request.body);
    if (!configuration.success) {
      return sendError(
        reply,
        400,
        "INVALID_REQUEST",
        "The integration configuration is invalid.",
      );
    }

    try {
      const result = await integrationRepository.create({
        actorId: session.actor.actorId,
        configuration: configuration.data,
        tenantId: session.tenant.tenantId,
      });
      return reply.status(201).send(integrationSchema.parse(result.integration));
    } catch (error) {
      return sendRepositoryError(request, reply, error);
    }
  });

  server.patch<{ Params: { integrationId: string } }>(
    "/v1/integrations/:integrationId",
    async (request, reply) => {
      const session = await resolveSession(request, reply, authenticator);
      if (session === undefined || !requirePermission(session, "integrations:write", reply)) return reply;
      const integrationId = uuidSchema.safeParse(request.params.integrationId);
      const changes = updateIntegrationRequestSchema.safeParse(request.body);
      if (!integrationId.success || !changes.success) {
        return sendError(reply, 400, "INVALID_REQUEST", "The integration update is invalid.");
      }
      try {
        const integration = await integrationRepository.update({
          actorId: session.actor.actorId,
          changes: changes.data,
          integrationId: integrationId.data,
          tenantId: session.tenant.tenantId,
        });
        return integration === null
          ? sendError(reply, 404, "NOT_FOUND", "The integration was not found.")
          : integrationSchema.parse(integration);
      } catch (error) {
        return sendRepositoryError(request, reply, error);
      }
    },
  );

  server.get<{ Querystring: { integrationId?: string } }>("/v1/ingestion-runs", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "ingestion:read", reply)) return reply;
    const integrationId = request.query.integrationId === undefined
      ? undefined
      : uuidSchema.safeParse(request.query.integrationId);
    if (integrationId !== undefined && !integrationId.success) {
      return sendError(reply, 400, "INVALID_REQUEST", "The integration filter is invalid.");
    }
    try {
      const runs = await ingestionService.listRuns(session.tenant.tenantId, integrationId?.data);
      return ingestionRunListSchema.parse({ data: runs, schemaVersion: "1" });
    } catch (error) {
      return sendIngestionError(request, reply, error, "run listing");
    }
  });

  server.post<{ Params: { integrationId: string } }>("/v1/integrations/:integrationId/runs", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "ingestion:write", reply)) return reply;
    const integrationId = uuidSchema.safeParse(request.params.integrationId);
    const input = createIngestionRunRequestSchema.safeParse(request.body);
    if (!integrationId.success || !input.success) {
      return sendError(reply, 400, "INVALID_REQUEST", "The ingestion range is invalid.");
    }
    try {
      const integration = await integrationRepository.getForTenant(session.tenant.tenantId, integrationId.data);
      if (integration === null) return sendError(reply, 404, "NOT_FOUND", "The integration was not found.");
      const startBlock = BigInt(integration.startingBlock);
      const endBlock = BigInt(input.data.endBlock);
      if (endBlock < startBlock || endBlock - startBlock + 1n > maximumIngestionBlockSpan) {
        return sendError(
          reply,
          400,
          "INVALID_RANGE",
          "The ingestion range is invalid or exceeds the configured limit.",
        );
      }
      const run = await ingestionService.start({
        endBlock: input.data.endBlock,
        integrationId: integration.integrationId,
        startBlock: integration.startingBlock,
        tenantId: session.tenant.tenantId,
      });
      return reply.status(201).send(ingestionRunSchema.parse(run));
    } catch (error) {
      if (error instanceof RangeError) {
        return sendError(reply, 400, "INVALID_RANGE", "The ingestion range is invalid.");
      }
      return sendIngestionError(request, reply, error, "run start");
    }
  });

  server.post<{ Params: { action: string; runId: string } }>("/v1/ingestion-runs/:runId/:action", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "ingestion:write", reply)) return reply;
    const runId = uuidSchema.safeParse(request.params.runId);
    if (!runId.success || !["pause", "resume", "stop"].includes(request.params.action)) {
      return sendError(reply, 400, "INVALID_REQUEST", "The ingestion action is invalid.");
    }
    const action = request.params.action as "pause" | "resume" | "stop";
    try {
      const run = await ingestionService[action](session.tenant.tenantId, runId.data);
      return run === null
        ? sendError(reply, 404, "NOT_FOUND", "The ingestion run was not found.")
        : ingestionRunSchema.parse(run);
    } catch (error) {
      return sendIngestionError(request, reply, error, `run ${action}`);
    }
  });

  server.get<{ Querystring: { integrationId?: string } }>("/v1/movements", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "movements:read", reply)) return reply;
    const integrationId = request.query.integrationId === undefined
      ? undefined
      : uuidSchema.safeParse(request.query.integrationId);
    if (integrationId !== undefined && !integrationId.success) {
      return sendError(reply, 400, "INVALID_REQUEST", "The integration filter is invalid.");
    }
    try {
      const movements = await ingestionService.listMovements(session.tenant.tenantId, integrationId?.data);
      return movementListSchema.parse({ data: movements, schemaVersion: "1" });
    } catch (error) {
      return sendIngestionError(request, reply, error, "movement listing");
    }
  });

  server.get<{ Params: { movementId: string } }>("/v1/movements/:movementId", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "movements:read", reply)) return reply;
    const movementId = uuidSchema.safeParse(request.params.movementId);
    if (!movementId.success) return sendError(reply, 400, "INVALID_REQUEST", "The movement identifier is invalid.");
    try {
      const movements = await ingestionService.listMovements(session.tenant.tenantId);
      const movement = movements.find((item) => item.movementId === movementId.data);
      return movement === undefined
        ? sendError(reply, 404, "NOT_FOUND", "The movement was not found.")
        : canonicalChainMovementSchema.parse(movement);
    } catch (error) {
      return sendIngestionError(request, reply, error, "movement detail lookup");
    }
  });

  server.get<{ Params: { movementId: string } }>("/v1/movements/:movementId/verification-decisions", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "verification:read", reply)) return reply;
    const movementId = uuidSchema.safeParse(request.params.movementId);
    if (!movementId.success) return sendError(reply, 400, "INVALID_REQUEST", "The movement identifier is invalid.");
    try {
      const decisions = await verificationStore.listForMovement(session.tenant.tenantId, movementId.data);
      return verificationDecisionListSchema.parse({ data: decisions, schemaVersion: "1" });
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.get("/v1/reconciliations", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "reconciliation:read", reply)) return reply;
    try {
      const results = await reconciliationService.listResults(session.tenant.tenantId);
      return positionReconciliationListSchema.parse({ data: results, schemaVersion: "1" });
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.post("/v1/reconciliations", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "reconciliation:write", reply)) return reply;
    const input = createPositionReconciliationRequestSchema.safeParse(request.body);
    if (!input.success) return sendError(reply, 400, "INVALID_REQUEST", "The reconciliation request is invalid.");
    try {
      const result = await reconciliationRunner.run({
        request: input.data,
        tenantId: session.tenant.tenantId,
      });
      return reply.status(201).send(positionReconciliationSchema.parse(result));
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.get<{ Params: { reconciliationId: string } }>("/v1/reconciliations/:reconciliationId", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "reconciliation:read", reply)) return reply;
    const reconciliationId = uuidSchema.safeParse(request.params.reconciliationId);
    if (!reconciliationId.success) return sendError(reply, 400, "INVALID_REQUEST", "The reconciliation identifier is invalid.");
    try {
      const result = await reconciliationService.getResult(session.tenant.tenantId, reconciliationId.data);
      return result === null
        ? sendError(reply, 404, "NOT_FOUND", "The reconciliation result was not found.")
        : positionReconciliationSchema.parse(result);
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.get("/v1/exceptions", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "exceptions:read", reply)) return reply;
    try {
      const exceptions = await reconciliationService.listExceptions(session.tenant.tenantId);
      return operationalExceptionListSchema.parse({ data: exceptions, schemaVersion: "1" });
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.get<{ Params: { exceptionId: string } }>("/v1/exceptions/:exceptionId", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "exceptions:read", reply)) return reply;
    const exceptionId = uuidSchema.safeParse(request.params.exceptionId);
    if (!exceptionId.success) return sendError(reply, 400, "INVALID_REQUEST", "The exception identifier is invalid.");
    try {
      const item = await reconciliationService.getException(session.tenant.tenantId, exceptionId.data);
      return item === null
        ? sendError(reply, 404, "NOT_FOUND", "The exception was not found.")
        : operationalExceptionSchema.parse(item);
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.get<{ Params: { exceptionId: string } }>("/v1/exceptions/:exceptionId/events", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "exceptions:read", reply)) return reply;
    const exceptionId = uuidSchema.safeParse(request.params.exceptionId);
    if (!exceptionId.success) return sendError(reply, 400, "INVALID_REQUEST", "The exception identifier is invalid.");
    try {
      const events = await reconciliationService.listExceptionEvents(session.tenant.tenantId, exceptionId.data);
      return { data: events.map((event) => ({ ...event, schemaVersion: "1" })), schemaVersion: "1" };
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  server.patch<{ Params: { exceptionId: string } }>("/v1/exceptions/:exceptionId", async (request, reply) => {
    const session = await resolveSession(request, reply, authenticator);
    if (session === undefined || !requirePermission(session, "exceptions:write", reply)) return reply;
    const exceptionId = uuidSchema.safeParse(request.params.exceptionId);
    const changes = updateOperationalExceptionRequestSchema.safeParse(request.body);
    if (!exceptionId.success || !changes.success) {
      return sendError(reply, 400, "INVALID_REQUEST", "The exception workflow update is invalid.");
    }
    try {
      const item = await reconciliationService.updateException({
        actorId: session.actor.actorId,
        changes: changes.data,
        exceptionId: exceptionId.data,
        tenantId: session.tenant.tenantId,
      });
      return item === null
        ? sendError(reply, 404, "NOT_FOUND", "The exception was not found.")
        : operationalExceptionSchema.parse(item);
    } catch (error) {
      return sendControlError(request, reply, error);
    }
  });

  return server;
}
