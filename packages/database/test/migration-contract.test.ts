import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../migrations/0001_foundation.sql", import.meta.url);

describe("foundation migration contract", () => {
  it("declares fail-closed tenant policies and tenant-safe relationships", async () => {
    const sql = await readFile(fileURLToPath(migrationUrl), "utf8");

    expect(sql).toContain("current_setting('app.tenant_id', true)");
    expect(sql.match(/FORCE ROW LEVEL SECURITY/gu)).toHaveLength(6);
    expect(sql).toContain("FOREIGN KEY (tenant_id, evidence_id)");
    expect(sql).toContain("evidence_objects_append_only");
    expect(sql).toContain("CREATE TABLE orbit.outbox_events");
  });
});
