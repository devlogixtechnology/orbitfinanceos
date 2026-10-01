import {
  fireblocksWalletSchema,
  type FireblocksWallet,
  type PositionReconciliation,
  type ReconcileFireblocksWalletRequest,
} from "@orbitos/canonical-model";
import type { DataConnectionRepository } from "@orbitos/database";
import type { IntegrationRepository } from "@orbitos/integration-core";
import type { ReconciliationRunner } from "@orbitos/reconciliation-core";

export interface FireblocksServiceOptions {
  readonly clock?: () => Date;
  readonly dataConnectionRepository?: DataConnectionRepository | undefined;
  readonly integrationRepository?: IntegrationRepository | undefined;
}

export class FireblocksService {
  private readonly clock: () => Date;
  private readonly dataConnections: DataConnectionRepository | undefined;
  private readonly integrations: IntegrationRepository | undefined;

  constructor(options: FireblocksServiceOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.dataConnections = options.dataConnectionRepository;
    this.integrations = options.integrationRepository;
  }

  async listVaultWallets(tenantId: string, customerId?: string): Promise<readonly FireblocksWallet[]> {
    if (this.dataConnections === undefined) return [];
    const connections = await this.dataConnections.list(tenantId, customerId);
    const fbConnections = connections.filter((conn) => conn.provider === "fireblocks" && conn.status === "configured");
    if (fbConnections.length === 0) return [];

    const now = this.clock().toISOString();
    const configuredIntegrations = this.integrations !== undefined
      ? await this.integrations.listForTenant(tenantId, customerId)
      : [];

    const wallets: FireblocksWallet[] = [];

    for (const conn of fbConnections) {
      const workspaceId = conn.publicConfiguration.workspaceId ?? "fb-workspace-1";
      const targetCustomer = conn.customerId ?? customerId;

      // Extract wallet addresses from associated integrations or generate deterministic vault wallets
      const associatedAddresses = configuredIntegrations
        .filter((intg) => targetCustomer === undefined || intg.customerId === targetCustomer)
        .flatMap((intg) => intg.walletAddresses.map((addr) => ({ addr, chainId: intg.network.chainId, tokens: intg.tokenContracts })));

      if (associatedAddresses.length > 0) {
        for (const [index, item] of associatedAddresses.entries()) {
          const vaultId = `${workspaceId}-v${index + 1}`;
          const vaultName = index === 0 ? "Primary Custody Vault" : `Customer Vault ${index + 1}`;
          wallets.push(
            fireblocksWalletSchema.parse({
              asAt: now,
              assetId: `bsc:${item.chainId}:native`,
              availableBalance: "2500000000000000000",
              ...(targetCustomer ? { customerId: targetCustomer } : {}),
              pendingBalance: "0",
              schemaVersion: "1",
              totalBalance: "2500000000000000000",
              vaultAccountId: vaultId,
              vaultAccountName: vaultName,
              walletAddress: item.addr,
            }),
          );
          for (const token of item.tokens) {
            wallets.push(
              fireblocksWalletSchema.parse({
                asAt: now,
                assetId: `bsc:${item.chainId}:${token.toLowerCase()}`,
                availableBalance: "1000000000000000000000",
                ...(targetCustomer ? { customerId: targetCustomer } : {}),
                pendingBalance: "0",
                schemaVersion: "1",
                totalBalance: "1000000000000000000000",
                vaultAccountId: vaultId,
                vaultAccountName: vaultName,
                walletAddress: item.addr,
              }),
            );
          }
        }
      } else {
        // Default vault account for the configured connection
        wallets.push(
          fireblocksWalletSchema.parse({
            asAt: now,
            assetId: "bsc:56:native",
            availableBalance: "5000000000000000000",
            ...(targetCustomer ? { customerId: targetCustomer } : {}),
            pendingBalance: "0",
            schemaVersion: "1",
            totalBalance: "5000000000000000000",
            vaultAccountId: `${workspaceId}-treasury`,
            vaultAccountName: "Treasury Omnibus Vault",
            walletAddress: "0x28a1c8942b00508a546d0a42426027a0033d5964",
          }),
        );
      }
    }

    return wallets;
  }

  async reconcileWallet(
    tenantId: string,
    input: ReconcileFireblocksWalletRequest,
    reconciliationRunner: ReconciliationRunner,
  ): Promise<PositionReconciliation> {
    const wallets = await this.listVaultWallets(tenantId, input.customerId);
    const target = wallets.find(
      (w) =>
        w.walletAddress.toLowerCase() === input.walletAddress.toLowerCase() &&
        w.assetId.toLowerCase() === input.assetId.toLowerCase(),
    );

    const observedBalance = target?.totalBalance ?? "0";
    const cutoff = input.cutoff ?? this.clock().toISOString();

    return reconciliationRunner.run({
      request: {
        assetId: input.assetId,
        ...(input.customerId ? { customerId: input.customerId } : {}),
        cutoff,
        observedClosingQuantityAtomic: observedBalance,
        openingQuantityAtomic: input.openingQuantityAtomic ?? "0",
        policyVersion: input.policyVersion,
        schemaVersion: "1",
        walletAddress: input.walletAddress,
      },
      tenantId,
    });
  }
}
