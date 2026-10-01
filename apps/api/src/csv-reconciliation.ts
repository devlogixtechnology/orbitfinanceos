import type { PositionReconciliation } from "@orbitos/canonical-model";
import type { DataConnectionRepository } from "@orbitos/database";
import type { DurableEvidenceStore } from "@orbitos/evidence-core";
import type { IntegrationRepository } from "@orbitos/integration-core";
import type { ReconciliationRunner } from "@orbitos/reconciliation-core";
import { verifyTransactionOnChain, SUPPORTED_NETWORK_SCANNERS } from "./network-scanners.js";

export interface ReconcileCsvOptions {
  readonly clock?: () => Date;
  readonly companyWallets?: readonly string[] | undefined;
  readonly customerId?: string | undefined;
  readonly dataConnectionRepository: DataConnectionRepository;
  readonly evidenceStore: DurableEvidenceStore;
  readonly importId: string;
  readonly integrationRepository?: IntegrationRepository | undefined;
  readonly policyVersion?: string | undefined;
  readonly reconciliationRunner: ReconciliationRunner;
  readonly tenantId: string;
}

export interface ParsedCsvTransaction {
  readonly amount: string;
  readonly asset: string;
  readonly date: string;
  readonly destinationAddress: string;
  readonly fee?: string;
  readonly isInterWallet?: boolean;
  readonly network?: string;
  readonly operation?: string;
  readonly rawRow: Record<string, string>;
  readonly sourceAddress: string;
  readonly status?: string;
  readonly txHash?: string;
}

/**
 * Robust RFC 4180 CSV parser that parses character-by-character,
 * properly preserving multi-line quoted fields, escaped quotes,
 * and skipping leading report metadata rows.
 */
export function parseRobustCsv(rawCsvText: string): Array<Record<string, string>> {
  const clean = rawCsvText.replace(/^\uFEFF/u, "").trim();
  if (!clean) return [];

  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRecord.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRecord.push(currentField.trim());
      currentField = "";
      if (currentRecord.some((f) => f.length > 0)) {
        records.push(currentRecord);
      }
      currentRecord = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some((f) => f.length > 0)) {
      records.push(currentRecord);
    }
  }

  if (records.length === 0) return [];

  // Find the header row: Look for recognizable column keywords
  const headerKeywords = [
    "txid", "tx_id", "transaction_id", "hash", "txhash", "tx_hash",
    "amount", "asset", "currency", "token", "source", "destination",
    "from", "to", "wallet", "address", "opening", "closing", "balance",
    "date", "time", "timestamp", "created_at"
  ];

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(records.length, 15); i += 1) {
    const record = records[i] ?? [];
    const normalized = record.map((cell) => cell.toLowerCase().replace(/[\s_-]+/g, "_"));
    const matches = normalized.filter((col) => headerKeywords.some((kw) => col.includes(kw)));
    if (matches.length >= 2 || (matches.length >= 1 && record.length <= 4)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }

  const rawHeaders = records[headerRowIndex] ?? [];
  const headers = rawHeaders.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  );

  const rows: Array<Record<string, string>> = [];
  for (let i = headerRowIndex + 1; i < records.length; i += 1) {
    const record = records[i] ?? [];
    if (record.length === 0 || (record.length === 1 && !record[0])) continue;
    const row: Record<string, string> = {};
    let hasValue = false;
    for (let j = 0; j < headers.length; j += 1) {
      const headerKey = headers[j];
      const val = record[j] ?? "";
      if (headerKey) {
        row[headerKey] = val;
        if (val.length > 0) hasValue = true;
      }
    }
    if (hasValue) {
      rows.push(row);
    }
  }

  return rows;
}

export function normalizeHeaderValue(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k].trim().length > 0) {
      return row[k].trim();
    }
  }
  return "";
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
      policyVersion = "bsc-v1",
      integrationRepository,
      companyWallets = [],
    } = options;

    const imports = await dataConnectionRepository.listCsvImports(tenantId, customerId);
    let targetImport = imports.find((item) => item.importId === importId);
    if (!targetImport && customerId) {
      const fallbackImports = await dataConnectionRepository.listCsvImports(tenantId);
      targetImport = fallbackImports.find((item) => item.importId === importId);
    }
    if (!targetImport) {
      throw new Error(`CSV_IMPORT_NOT_FOUND: Import ${importId} does not exist for tenant.`);
    }

    const rawBytes = await evidenceStore.readByDigest(tenantId, targetImport.sha256);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(rawBytes);
    const rows = parseRobustCsv(text);

    if (rows.length === 0) {
      throw new Error("EMPTY_CSV: The uploaded CSV file contains no readable data rows.");
    }

    // Discover known company wallets
    const knownCompanyWallets = new Set<string>(
      companyWallets.map((w) => w.toLowerCase())
    );

    if (integrationRepository) {
      try {
        const integrations = await integrationRepository.listForTenant(tenantId, customerId);
        for (const intg of integrations) {
          for (const addr of intg.walletAddresses) {
            if (addr) knownCompanyWallets.add(addr.toLowerCase());
          }
        }
      } catch {
        // Fall through
      }
    }

    // Check if CSV is balance position format vs transaction movements format
    const sample = rows[0] ?? {};
    const isPositionSnapshot = Boolean(
      normalizeHeaderValue(sample, "opening_balance", "opening_quantity_atomic", "opening") ||
      normalizeHeaderValue(sample, "closing_balance", "observed_closing_quantity_atomic", "closing")
    );

    const nowIso = this.clock().toISOString();
    const reconciliations: PositionReconciliation[] = [];

    if (isPositionSnapshot) {
      // Process position snapshots directly
      for (const row of rows) {
        const walletAddress = normalizeHeaderValue(
          row,
          "wallet_address", "wallet", "address", "account", "source_address"
        );
        if (!walletAddress) {
          throw new Error("INVALID_CSV_RECORD: Wallet address column missing or empty in row.");
        }

        let assetId = normalizeHeaderValue(row, "asset_id", "asset", "currency", "token", "symbol") || "bsc:56:native";
        if (!assetId.includes(":")) {
          assetId = `bsc:56:${assetId.toLowerCase()}`;
        }

        const openingStr = normalizeHeaderValue(row, "opening_quantity_atomic", "opening_balance", "opening") || "0";
        const closingStr = normalizeHeaderValue(row, "observed_closing_quantity_atomic", "closing_balance", "closing", "amount") || "0";

        const opening = openingStr.split(".")[0] || "0";
        const closing = closingStr.split(".")[0] || "0";

        const cutoffRaw = normalizeHeaderValue(row, "cutoff", "effective_at", "timestamp", "date", "as_at");
        let cutoff = nowIso;
        if (cutoffRaw && !isNaN(Date.parse(cutoffRaw))) {
          cutoff = new Date(cutoffRaw).toISOString();
        }

        const effectiveCustomerId = customerId ?? targetImport.customerId;
        const result = await reconciliationRunner.run({
          request: {
            assetId,
            ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
            cutoff,
            ...(closing ? { observedClosingQuantityAtomic: closing } : {}),
            openingQuantityAtomic: opening,
            policyVersion,
            schemaVersion: "1",
            walletAddress,
          },
          tenantId,
        });

        reconciliations.push(result);
      }
      return reconciliations;
    }

    // Process Transaction Movements (e.g. Fireblocks export, exchange export)
    // 1. Group transactions by wallet and asset
    interface WalletAssetRollup {
      assetId: string;
      inflowsAtomic: bigint;
      interWalletCount: number;
      interWalletVolumeAtomic: bigint;
      latestDate: string;
      outflowsAtomic: bigint;
      txCount: number;
      txHashes: string[];
      verifiedCount: number;
      walletAddress: string;
    }

    const rollups = new Map<string, WalletAssetRollup>();

    // If company wallets set is empty, discover company wallets from sources/destinations with highest frequency
    if (knownCompanyWallets.size === 0) {
      for (const row of rows) {
        const src = normalizeHeaderValue(row, "source_address", "source", "from", "sender");
        const dst = normalizeHeaderValue(row, "destination_address", "destination", "to", "recipient");
        if (src) knownCompanyWallets.add(src.toLowerCase());
        if (dst) knownCompanyWallets.add(dst.toLowerCase());
      }
    }

    let validTxFound = false;

    for (const row of rows) {
      const src = normalizeHeaderValue(row, "source_address", "source", "from", "sender", "wallet_address", "wallet");
      const dst = normalizeHeaderValue(row, "destination_address", "destination", "to", "recipient");
      const asset = normalizeHeaderValue(row, "asset", "currency", "token", "symbol", "coin", "asset_id") || "USDT";
      const amountStr = normalizeHeaderValue(row, "amount", "gross_amount", "net_amount", "value", "quantity", "volume") || "0";
      const txHash = normalizeHeaderValue(row, "tx_hash", "txhash", "hash", "transaction_hash", "txid");
      const status = normalizeHeaderValue(row, "status", "state", "tx_status").toUpperCase();
      const date = normalizeHeaderValue(row, "date", "time", "timestamp", "created_at") || nowIso;

      // Filter out explicitly failed / cancelled / blocked transactions
      if (status && (status === "FAILED" || status === "REJECTED" || status === "CANCELLED" || status === "BLOCKED")) {
        continue;
      }

      const numAmount = parseFloat(amountStr.replace(/,/g, "")) || 0;
      if (numAmount === 0 && !txHash) continue;
      validTxFound = true;

      // Format atomic units (6 decimals for USDT/USDC, 18 for ETH/BNB, 8 for BTC)
      const decimals = asset.toUpperCase().includes("BTC") ? 8 : (asset.toUpperCase().includes("USD") ? 6 : 18);
      const atomicMultiplier = BigInt(10 ** decimals);
      const parsedAtomic = BigInt(Math.round(numAmount * (10 ** decimals)));

      const assetId = asset.includes(":") ? asset : `bsc:56:${asset.toLowerCase()}`;

      const srcLower = src.toLowerCase();
      const dstLower = dst.toLowerCase();

      const isSrcCompany = knownCompanyWallets.has(srcLower);
      const isDstCompany = knownCompanyWallets.has(dstLower);

      // Check for Inter-wallet transfer
      const isInterWallet = isSrcCompany && isDstCompany && srcLower !== dstLower;

      const targetWallets = isDstCompany ? [dst] : (isSrcCompany ? [src] : [dst || src]);

      for (const w of targetWallets) {
        if (!w) continue;
        const key = `${w.toLowerCase()}:${assetId}`;
        let existing = rollups.get(key);
        if (!existing) {
          existing = {
            walletAddress: w,
            assetId,
            inflowsAtomic: 0n,
            outflowsAtomic: 0n,
            interWalletVolumeAtomic: 0n,
            interWalletCount: 0,
            txCount: 0,
            verifiedCount: 0,
            txHashes: [],
            latestDate: date,
          };
          rollups.set(key, existing);
        }

        existing.txCount += 1;
        if (date > existing.latestDate) existing.latestDate = date;
        if (txHash && !existing.txHashes.includes(txHash)) {
          existing.txHashes.push(txHash);
        }

        if (isInterWallet) {
          existing.interWalletCount += 1;
          existing.interWalletVolumeAtomic += parsedAtomic;
        } else if (w.toLowerCase() === dstLower) {
          existing.inflowsAtomic += parsedAtomic;
        } else if (w.toLowerCase() === srcLower) {
          existing.outflowsAtomic += parsedAtomic;
        }
      }
    }

    if (!validTxFound || rollups.size === 0) {
      throw new Error("NO_VALID_TRANSACTIONS: The uploaded CSV does not contain any valid transaction movements.");
    }

    // 2. Perform reconciliation for each wallet + asset rollup
    for (const [, rollup] of rollups) {
      // Net As-At Balance = Inflows - Outflows
      // (Inter-wallet transfers are internal reallocations and do not distort net balance)
      const netAsAtAtomic = rollup.inflowsAtomic >= rollup.outflowsAtomic
        ? (rollup.inflowsAtomic - rollup.outflowsAtomic).toString()
        : "0";

      let cutoff = nowIso;
      if (rollup.latestDate && !isNaN(Date.parse(rollup.latestDate))) {
        cutoff = new Date(rollup.latestDate).toISOString();
      }

      // Check on-chain verification status if txHashes present
      let verifiedOnChainCount = 0;
      for (const h of rollup.txHashes.slice(0, 5)) {
        if (h.startsWith("0x") && h.length === 66) {
          try {
            const check = await verifyTransactionOnChain(h, "bsc", "https://api.bscscan.com/api");
            if (check.verified) verifiedOnChainCount += 1;
          } catch {
            // Ignore offline explorer in unit tests
          }
        }
      }

      const effectiveCustomerId = customerId ?? targetImport.customerId;
      const result = await reconciliationRunner.run({
        request: {
          assetId: rollup.assetId,
          ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
          cutoff,
          observedClosingQuantityAtomic: netAsAtAtomic,
          openingQuantityAtomic: "0",
          policyVersion,
          schemaVersion: "1",
          walletAddress: rollup.walletAddress,
        },
        tenantId,
      });

      reconciliations.push(result);
    }

    return reconciliations;
  }
}
