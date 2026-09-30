import "server-only";

import {
  integrationListSchema,
  csvImportListSchema,
  dataConnectionListSchema,
  controlPlaneSnapshotSchema,
  ingestionRunListSchema,
  movementListSchema,
  operationalExceptionListSchema,
  operationalExceptionSchema,
  positionReconciliationListSchema,
  positionReconciliationSchema,
  sessionContextSchema,
  verificationDecisionListSchema,
  exceptionWorkflowEventListSchema,
  type Integration,
  type CsvImport,
  type DataConnection,
  type ControlPlaneSnapshot,
  type IngestionRun,
  type CanonicalChainMovement,
  type SessionContext,
  type OperationalException,
  type PositionReconciliation,
  type VerificationDecision,
  type ExceptionWorkflowEvent,
} from "@orbitos/canonical-model";
import { cookies } from "next/headers";
import { cache } from "react";

const apiBaseUrl = process.env.ORBITOS_API_BASE_URL ?? "http://127.0.0.1:3000";

export async function getSessionToken(): Promise<string | undefined> {
  const token = (await cookies()).get("orbitos_session")?.value;
  return token === undefined || token.length === 0 ? undefined : token;
}

export async function fetchAuthorizedApi(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const token = await getSessionToken();
  if (token === undefined) {
    return null;
  }

  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return null;
  }
}

export const loadAuthorizedSession = cache(async (): Promise<SessionContext | null> => {
  const response = await fetchAuthorizedApi("/v1/session");
  if (response === null || !response.ok) {
    return null;
  }

  const parsed = sessionContextSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
});

export async function loadControlPlane(): Promise<ControlPlaneSnapshot | null> {
  const response = await fetchAuthorizedApi("/v1/control-plane");
  if (response === null || !response.ok) return null;
  const parsed = controlPlaneSnapshotSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export async function loadIntegrations(): Promise<readonly Integration[] | null> {
  const response = await fetchAuthorizedApi("/v1/integrations");
  if (response === null || !response.ok) {
    return null;
  }

  const parsed = integrationListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadDataConnections(): Promise<readonly DataConnection[] | null> {
  const response = await fetchAuthorizedApi("/v1/data-connections");
  if (response === null || !response.ok) return null;
  const parsed = dataConnectionListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadCsvImports(): Promise<readonly CsvImport[] | null> {
  const response = await fetchAuthorizedApi("/v1/csv-imports");
  if (response === null || !response.ok) return null;
  const parsed = csvImportListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadIngestionRuns(
  integrationId?: string,
): Promise<readonly IngestionRun[] | null> {
  const query = integrationId === undefined ? "" : `?integrationId=${encodeURIComponent(integrationId)}`;
  const response = await fetchAuthorizedApi(`/v1/ingestion-runs${query}`);
  if (response === null || !response.ok) return null;
  const parsed = ingestionRunListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadMovements(
  integrationId?: string,
): Promise<readonly CanonicalChainMovement[] | null> {
  const query = integrationId === undefined ? "" : `?integrationId=${encodeURIComponent(integrationId)}`;
  const response = await fetchAuthorizedApi(`/v1/movements${query}`);
  if (response === null || !response.ok) return null;
  const parsed = movementListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadVerificationDecisions(
  movementId: string,
): Promise<readonly VerificationDecision[] | null> {
  const response = await fetchAuthorizedApi(`/v1/movements/${encodeURIComponent(movementId)}/verification-decisions`);
  if (response === null || !response.ok) return null;
  const parsed = verificationDecisionListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadReconciliations(): Promise<readonly PositionReconciliation[] | null> {
  const response = await fetchAuthorizedApi("/v1/reconciliations");
  if (response === null || !response.ok) return null;
  const parsed = positionReconciliationListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadReconciliation(reconciliationId: string): Promise<PositionReconciliation | null> {
  const response = await fetchAuthorizedApi(`/v1/reconciliations/${encodeURIComponent(reconciliationId)}`);
  if (response === null || !response.ok) return null;
  const parsed = positionReconciliationSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export async function loadExceptions(): Promise<readonly OperationalException[] | null> {
  const response = await fetchAuthorizedApi("/v1/exceptions");
  if (response === null || !response.ok) return null;
  const parsed = operationalExceptionListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}

export async function loadException(exceptionId: string): Promise<OperationalException | null> {
  const response = await fetchAuthorizedApi(`/v1/exceptions/${encodeURIComponent(exceptionId)}`);
  if (response === null || !response.ok) return null;
  const parsed = operationalExceptionSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

export async function loadExceptionEvents(exceptionId: string): Promise<readonly ExceptionWorkflowEvent[] | null> {
  const response = await fetchAuthorizedApi(`/v1/exceptions/${encodeURIComponent(exceptionId)}/events`);
  if (response === null || !response.ok) return null;
  const parsed = exceptionWorkflowEventListSchema.safeParse(await response.json());
  return parsed.success ? parsed.data.data : null;
}
