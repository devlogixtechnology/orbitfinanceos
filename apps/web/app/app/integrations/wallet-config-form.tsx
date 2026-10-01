"use client";

import type { Customer } from "@orbitos/canonical-model";
import { Wallet } from "@phosphor-icons/react";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { configureCompanyWallet } from "./actions";

interface WalletConfigFormProps {
  readonly customers?: readonly Customer[] | undefined;
  readonly defaultCustomerId?: string | undefined;
  readonly isCustomer: boolean;
}

export function WalletConfigForm({
  customers,
  defaultCustomerId,
  isCustomer,
}: Readonly<WalletConfigFormProps>) {
  return (
    <form action={configureCompanyWallet} className="source-connect-form">
      {!isCustomer && customers && customers.length > 0 ? (
        <>
          <label htmlFor="wallet-customer">Target Customer (Optional)</label>
          <select id="wallet-customer" name="customerId" defaultValue={defaultCustomerId ?? ""}>
            <option value="">Tenant-wide (Default)</option>
            {customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.displayName} ({c.externalReference})
              </option>
            ))}
          </select>
        </>
      ) : null}

      <label htmlFor="wallet-label">Wallet Designation / Purpose</label>
      <input
        id="wallet-label"
        name="label"
        placeholder="e.g. Treasury Reserve, Operational Hot Wallet, Staking Vault"
        required
      />

      <label htmlFor="wallet-address">Wallet Address (0x...)</label>
      <input
        id="wallet-address"
        name="address"
        pattern="0x[a-fA-F0-9]{40}"
        placeholder="0x…"
        required
      />

      <label htmlFor="wallet-network">Network Family</label>
      <select id="wallet-network" name="network" defaultValue="ethereum">
        <option value="ethereum">Ethereum (ERC-20 / EVM)</option>
        <option value="bsc">BNB Smart Chain (BEP-20)</option>
        <option value="polygon">Polygon (POL / ERC-20)</option>
        <option value="arbitrum">Arbitrum One</option>
        <option value="optimism">Optimism</option>
        <option value="base">Base</option>
        <option value="avalanche">Avalanche C-Chain</option>
        <option value="solana">Solana</option>
        <option value="tron">Tron (TRC-20)</option>
        <option value="bitcoin">Bitcoin (UTXO)</option>
      </select>

      <p className="form-help">
        Registering company-owned wallets allows the reconciliation engine to classify transfers between them as internal movements, eliminating revenue and expense distortion.
      </p>

      <PendingSubmitButton className="primary-button" pendingLabel="Registering internal wallet">
        <Wallet size={16} />
        Register Company Wallet
      </PendingSubmitButton>
    </form>
  );
}
