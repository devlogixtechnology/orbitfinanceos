import { NextResponse, type NextRequest } from "next/server";
import { loadAuthorizedSession, loadControlPlane, loadReconciliations } from "../../../lib/session";

export async function GET(request: NextRequest) {
  const session = await loadAuthorizedSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = session.actor.customerId ?? searchParams.get("customerId") ?? undefined;

  const [results, snapshot] = await Promise.all([
    loadReconciliations(customerId),
    !session.actor.customerId ? loadControlPlane() : Promise.resolve(null),
  ]);

  if (!results || results.length === 0) {
    return new NextResponse("No reconciliation records found to export.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 200,
    });
  }

  const customerMap = new Map(snapshot?.customers.map((c) => [c.customerId, c.displayName]) ?? []);

  const headers = [
    "Reconciliation ID",
    "Cutoff (UTC)",
    "Customer Scope",
    "Wallet Address",
    "Asset ID",
    "Expected Closing (Atomic)",
    "Observed Closing (Atomic)",
    "Difference (Atomic)",
    "Status / State",
    "Exceptions Count",
  ];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = results.map((r) => [
    escapeCsv(r.reconciliationId),
    escapeCsv(r.cutoff),
    escapeCsv(r.customerId && customerMap.has(r.customerId) ? customerMap.get(r.customerId) : "Tenant-wide"),
    escapeCsv(r.walletAddress),
    escapeCsv(r.assetId),
    escapeCsv(r.expectedClosingQuantityAtomic),
    escapeCsv(r.observedClosingQuantityAtomic ?? "N/A"),
    escapeCsv(r.differenceAtomic ?? "0"),
    escapeCsv(r.state),
    escapeCsv(r.exceptionCount),
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
  const filename = `orbitos-reconciliation-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
    status: 200,
  });
}
