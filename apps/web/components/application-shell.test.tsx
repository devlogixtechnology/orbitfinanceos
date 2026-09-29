import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApplicationShell } from "./application-shell";

const session = {
  actor: {
    actorId: "11111111-1111-4111-8111-111111111111",
    subject: "identity-provider|operator-1",
  },
  authenticatedAt: "2026-09-28T01:00:00.000Z",
  expiresAt: "2026-09-28T02:00:00.000Z",
  permissions: ["integrations:read"],
  roles: ["read_only_operator"],
  schemaVersion: "1" as const,
  tenant: {
    displayName: "Synthetic Treasury",
    tenantId: "22222222-2222-4222-8222-222222222222",
  },
};

describe("authenticated application shell", () => {
  it("renders authorized tenant identity and the delivered route set", () => {
    const markup = renderToStaticMarkup(
      <ApplicationShell initialTheme="system" session={session}>
        <main>Authorized content</main>
      </ApplicationShell>,
    );

    expect(markup).toContain("Synthetic Treasury");
    expect(markup).toContain("Authorized content");
    expect(markup).toContain("/app/integrations");
    expect(markup).toContain("/app/reconciliation");
    expect(markup).toContain("/app/exceptions");
  });
});
