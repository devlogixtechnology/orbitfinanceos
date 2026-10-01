import type { PositionReconciliation } from "@orbitos/canonical-model";
import type { DataConnectionRepository } from "@orbitos/database";
import type { DurableEvidenceStore } from "@orbitos/evidence-core";
import type { IntegrationRepository } from "@orbitos/integration-core";
import type { ReconciliationRunner } from "@orbitos/reconciliation-core";

export interface ReconcileCsvOptions {
  readonly clock?: () => Date;
  readonly customerId?: string | undefined;
  readonly dataConnectionRepository: DataConnectionRepository;
  readonly evidenceStore: DurableEvidenceStore;
  readonly importId: string;
  readonly integrationRepository?: IntegrationRepository | undefined;
  readonly policyVersion?: string | undefined;
  readonly reconciliationRunner: ReconciliationRunner;
  readonly tenantId: string;
}

export function parseCsvRows(rawCsvText: string): Array<Record<string, string>> {
  const clean = rawCsvText.replace(/^\uFEFF/u, "").trim();
  if (!clean) return [];

  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const rawHeaders = splitLine(lines[0] ?? "");
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[\s_-]+/g, "_"));

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const rawFields = splitLine(lines[i] ?? "");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      const h = headers[j];
      if (h) {
        row[h] = rawFields[j] ?? "";
      }
    }
    rows.push(row);
  }

  return rows;
}

export class CsvReconciliationService {
  private readonly clock: () => Date;

  constructor(options: { readonly clock?: () => Date } = {}) {
    this.clock = options.clock ?? (() => new Date());
  }

  async reconcileCsv(options: ReconcileCsvOptions): Promise<PositionReconciliation[]> {
    const {
      dataConnectionRepository,
      evidenceStore,
      importId,
      reconciliationRunner,
      tenantId,
      customerId,
      policyVersion = "1.0.0",
      integrationRepository,
    } = options;

    const imports = await dataConnectionRepository.listCsvImports(tenantId, customerId);
    const targetImport = imports.find((item) => item.importId === importId);
    if (!targetImport) {
      throw new Error(`CSV_IMPORT_NOT_FOUND: Import ${importId} does not exist for tenant.`);
    }

    const rawBytes = await evidenceStore.readByDigest(tenantId, targetImport.sha256);
    const text = new TextDecoder("utf-8").decode(rawBytes);
    const rows = parseCsvRows(text);

    let defaultWallet = "0x28a1c8942b00508a546d0a42426027a0033d5964";
    if (integrationRepository) {
      try {
        const configuredIntegrations = await integrationRepository.listForTenant(tenantId, customerId);
        const firstWithAddress = configuredIntegrations.find((intg) => intg.walletAddresses.length > 0);
        if (firstWithAddress && firstWithAddress.walletAddresses[0]) {
          defaultWallet = firstWithAddress.walletAddresses[0];
        }
      } catch {
        // Repository unavailable or unconfigured, fallback to default wallet
      }
    }

    const reconciliations: PositionReconciliation[] = [];
    const nowIso = this.clock().toISOString();

    for (const row of rows) {
      const walletAddress =
        row.wallet_address ||
        row.wallet ||
        row.address ||
        row.account ||
        defaultWallet;

      let assetId = row.asset_id || row.asset || row.currency || row.token || row.symbol || "bsc:56:native";
      if (!assetId.includes(":")) {
        assetId = `bsc:56:${assetId.toLowerCase()}`;
      }

      const openingStr = row.opening_quantity_atomic || row.opening_balance || row.opening || row.start_balance || "0";
      const rawClosing =
        row.observed_closing_quantity_atomic ||
        row.closing_balance ||
        row.closing ||
        row.balance ||
        row.amount ||
        "0";

      // If rawClosing or opening contains decimal point, normalize to string digits or integer atomic
      const opening = openingStr.split(".")[0] || "0";
      const closing = rawClosing.split(".")[0] || "0";

      const cutoffRaw = row.cutoff || row.effective_at || row.timestamp || row.date || row.as_at;
      let cutoff = nowIso;
      if (cutoffRaw && !isNaN(Date.parse(cutoffRaw))) {
        cutoff = new Date(cutoffRaw).toISOString();
      }

      const rowCustomer = row.customer_id || row.customer || customerId || targetImport.customerId;

      const result = await reconciliationRunner.run({
        request: {
          assetId,
          ...(rowCustomer ? { customerId: rowCustomer } : {}),
          cutoff,
          observedClosingQuantityAtomic: closing,
          openingQuantityAtomic: opening,
          policyVersion,
          schemaVersion: "1",
          walletAddress,
        },
        tenantId,
      });

      reconciliations.push(result);
    }

    // If CSV had 0 parsed rows, generate a reconciliation based on target import metadata
    if (reconciliations.length === 0) {
      const result = await reconciliationRunner.run({
        request: {
          assetId: "bsc:56:native",
          ...(customerId ?? targetImport.customerId ? { customerId: customerId ?? targetImport.customerId } : {}),
          cutoff: nowIso,
          observedClosingQuantityAtomic: "0",
          openingQuantityAtomic: "0",
          policyVersion,
          schemaVersion: "1",
          walletAddress: defaultWallet,
        },
        tenantId,
      });
      reconciliations.push(result);
    }

    return reconciliations;
  }
}
