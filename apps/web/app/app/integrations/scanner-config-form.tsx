"use client";

import { CheckCircle, Globe, Lightning, ShieldCheck, XCircle } from "@phosphor-icons/react";
import type { Customer, NetworkScannerInfo } from "@orbitos/canonical-model";
import { useState } from "react";

import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { configureNetworkScanner } from "./actions";

interface ScannerConfigFormProps {
  readonly customers?: readonly Customer[] | undefined;
  readonly defaultCustomerId?: string | undefined;
  readonly isCustomer: boolean;
  readonly scanners: readonly NetworkScannerInfo[];
}

export function ScannerConfigForm({
  customers,
  defaultCustomerId,
  isCustomer,
  scanners,
}: Readonly<ScannerConfigFormProps>) {
  const [selectedScannerId, setSelectedScannerId] = useState<string>(scanners[0]?.id ?? "ethereum");
  const [customApiUrl, setCustomApiUrl] = useState<string>("");
  const [apiKey, setApiKey] = useState<string>("");
  const [testStatus, setTestStatus] = useState<{
    blockHeight?: string | undefined;
    details?: string | undefined;
    latencyMs?: number | undefined;
    loading?: boolean | undefined;
    success?: boolean | undefined;
  } | null>(null);

  const currentScanner = scanners.find((s) => s.id === selectedScannerId) ?? scanners[0];
  const effectiveApiUrl = customApiUrl.trim() || currentScanner?.defaultApiUrl || "";

  async function handleTestConnection() {
    if (!effectiveApiUrl) return;
    setTestStatus({ loading: true });
    try {
      const res = await fetch("/v1/data-connections/scanners/test", {
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          apiUrl: effectiveApiUrl,
          networkId: selectedScannerId,
          schemaVersion: "1",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        setTestStatus({
          details: `Scanner responded with HTTP ${res.status}`,
          loading: false,
          success: false,
        });
        return;
      }
      const data = (await res.json()) as {
        blockHeight?: string;
        details?: string;
        latencyMs?: number;
        success?: boolean;
      };
      setTestStatus({
        blockHeight: data.blockHeight,
        details: data.details,
        latencyMs: data.latencyMs,
        loading: false,
        success: data.success,
      });
    } catch {
      setTestStatus({
        details: "Network probe failed. Verify the API URL and connectivity.",
        loading: false,
        success: false,
      });
    }
  }

  return (
    <form action={configureNetworkScanner} className="source-connect-form">
      {!isCustomer && customers && customers.length > 0 ? (
        <>
          <label htmlFor="scanner-customer">Target Customer (Optional)</label>
          <select id="scanner-customer" name="customerId" defaultValue={defaultCustomerId ?? ""}>
            <option value="">Tenant-wide (Default)</option>
            {customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.displayName} ({c.externalReference})
              </option>
            ))}
          </select>
        </>
      ) : null}

      <label htmlFor="scannerId">Select Blockchain Network Scanner (22+ Supported)</label>
      <select
        id="scannerId"
        name="scannerId"
        value={selectedScannerId}
        onChange={(e) => {
          setSelectedScannerId(e.target.value);
          setCustomApiUrl("");
          setTestStatus(null);
        }}
      >
        {scanners.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} [{s.category} · {s.nativeAsset}]
          </option>
        ))}
      </select>

      <input name="displayName" type="hidden" value={currentScanner ? `${currentScanner.name}` : "Blockchain Scanner"} />
      <input name="explorerUrl" type="hidden" value={currentScanner?.explorerUrl ?? ""} />

      <label htmlFor="scanner-api-url">
        API Endpoint URL {currentScanner ? <span className="scanner-badge">{currentScanner.category}</span> : null}
      </label>
      <input
        id="scanner-api-url"
        name="apiUrl"
        placeholder={currentScanner?.defaultApiUrl ?? "https://..."}
        value={customApiUrl || currentScanner?.defaultApiUrl || ""}
        onChange={(e) => setCustomApiUrl(e.target.value)}
        required
      />

      <label htmlFor="scanner-api-key">Scanner API Key (Etherscan, BscScan, PolygonScan, etc.)</label>
      <input
        id="scanner-api-key"
        name="apiKey"
        placeholder="Enter API key for higher rate limits (optional)"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />

      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={testStatus?.loading}
          className="secondary-button"
          style={{ fontSize: "0.78rem", padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Lightning size={14} />
          {testStatus?.loading ? "Probing Scanner..." : "Test Connection"}
        </button>
        {currentScanner?.docsUrl ? (
          <a
            href={currentScanner.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.74rem", color: "var(--color-accent)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <Globe size={13} />
            API Docs
          </a>
        ) : null}
      </div>

      {testStatus && !testStatus.loading ? (
        <div style={{
          padding: "8px 12px",
          borderRadius: "6px",
          fontSize: "0.78rem",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: testStatus.success ? "color-mix(in srgb, var(--color-success) 10%, transparent)" : "color-mix(in srgb, var(--color-error) 10%, transparent)",
          border: `1px solid ${testStatus.success ? "var(--color-success)" : "var(--color-error)"}`,
          color: "var(--color-text-primary)",
        }}>
          {testStatus.success ? (
            <CheckCircle size={18} color="var(--color-success)" weight="fill" />
          ) : (
            <XCircle size={18} color="var(--color-error)" weight="fill" />
          )}
          <div>
            <strong>{testStatus.success ? "Scanner Active & Responsive" : "Scanner Unreachable"}</strong>
            <div style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
              {testStatus.latencyMs ? `${testStatus.latencyMs}ms latency · ` : ""}
              {testStatus.blockHeight ? `Latest Block: #${testStatus.blockHeight} · ` : ""}
              {testStatus.details}
            </div>
          </div>
        </div>
      ) : null}

      <p className="form-help">
        Used as independent on-chain oracle to verify and reconcile Fireblocks transactions and deposit events.
      </p>

      <PendingSubmitButton className="primary-button" pendingLabel="Saving scanner connection">
        Save Scanner Source
      </PendingSubmitButton>
    </form>
  );
}
