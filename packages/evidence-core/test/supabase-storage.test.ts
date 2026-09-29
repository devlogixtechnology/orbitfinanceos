import { describe, expect, it } from "vitest";

import { SupabaseStorageEvidenceStore } from "../src/index.js";

describe("Supabase private evidence storage adapter", () => {
  it("writes immutable tenant-prefixed objects and verifies their digest without leaking the key", async () => {
    const objects = new Map<string, Uint8Array>();
    const requests: Array<{ headers: Headers; method: string; url: string }> = [];
    const fetchImplementation: typeof fetch = async (input, init) => {
      const url = input.toString();
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      requests.push({ headers, method, url });
      if (method === "POST") {
        if (objects.has(url)) return new Response("already exists", { status: 409 });
        objects.set(url, new Uint8Array(await new Response(init?.body).arrayBuffer()));
        return new Response(null, { status: 201 });
      }
      const object = objects.get(url);
      return object === undefined ? new Response("missing", { status: 404 }) : new Response(object);
    };
    const store = new SupabaseStorageEvidenceStore({
      fetchImplementation,
      secretKey: "server-only-test-key",
      supabaseUrl: "https://project.supabase.co",
    });
    const input = {
      evidenceId: "11111111-1111-4111-8111-111111111111",
      independenceGroup: "operator-a",
      integrationId: "22222222-2222-4222-8222-222222222222",
      observedAt: "2026-09-29T12:00:00.000Z",
      provider: "fixture",
      rawBytes: new TextEncoder().encode('{"exact":"payload"}'),
      tenantId: "33333333-3333-4333-8333-333333333333",
    };

    const first = await store.append(input);
    const replay = await store.append(input);
    expect(replay).toEqual(first);
    await expect(store.verifyIntegrity(input.tenantId, input.evidenceId)).resolves.toBe(true);
    expect(first.objectUri).toContain(`${input.tenantId}/objects/`);
    expect(JSON.stringify(requests)).not.toContain("server-only-test-key");
    expect(requests.every((request) => request.headers.get("authorization") === "Bearer server-only-test-key")).toBe(true);
  });
});
