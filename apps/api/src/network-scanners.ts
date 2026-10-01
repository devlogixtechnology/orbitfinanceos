export interface NetworkScannerInfo {
  readonly category: "EVM" | "UTXO" | "SVM" | "TVM";
  readonly chainId?: string;
  readonly defaultApiUrl: string;
  readonly docsUrl: string;
  readonly explorerUrl: string;
  readonly id: string;
  readonly name: string;
  readonly nativeAsset: string;
}

export const SUPPORTED_NETWORK_SCANNERS: readonly NetworkScannerInfo[] = [
  { id: "ethereum", name: "Ethereum Mainnet (Etherscan)", category: "EVM", chainId: "1", nativeAsset: "ETH", defaultApiUrl: "https://api.etherscan.io/api", explorerUrl: "https://etherscan.io", docsUrl: "https://docs.etherscan.io" },
  { id: "bsc", name: "BNB Smart Chain (BscScan)", category: "EVM", chainId: "56", nativeAsset: "BNB", defaultApiUrl: "https://api.bscscan.com/api", explorerUrl: "https://bscscan.com", docsUrl: "https://docs.bscscan.com" },
  { id: "polygon", name: "Polygon PoS (PolygonScan)", category: "EVM", chainId: "137", nativeAsset: "POL", defaultApiUrl: "https://api.polygonscan.com/api", explorerUrl: "https://polygonscan.com", docsUrl: "https://polygonscan.com/apis" },
  { id: "arbitrum", name: "Arbitrum One (Arbiscan)", category: "EVM", chainId: "42161", nativeAsset: "ETH", defaultApiUrl: "https://api.arbiscan.io/api", explorerUrl: "https://arbiscan.io", docsUrl: "https://docs.arbiscan.io" },
  { id: "optimism", name: "Optimism Mainnet (OP Etherscan)", category: "EVM", chainId: "10", nativeAsset: "ETH", defaultApiUrl: "https://api-optimistic.etherscan.io/api", explorerUrl: "https://optimistic.etherscan.io", docsUrl: "https://optimistic.etherscan.io/apis" },
  { id: "base", name: "Base (BaseScan)", category: "EVM", chainId: "8453", nativeAsset: "ETH", defaultApiUrl: "https://api.basescan.org/api", explorerUrl: "https://basescan.org", docsUrl: "https://docs.basescan.org" },
  { id: "avalanche", name: "Avalanche C-Chain (SnowTrace / Avascan)", category: "EVM", chainId: "43114", nativeAsset: "AVAX", defaultApiUrl: "https://api.snowtrace.io/api", explorerUrl: "https://snowtrace.io", docsUrl: "https://snowtrace.io" },
  { id: "solana", name: "Solana Mainnet (Solscan)", category: "SVM", nativeAsset: "SOL", defaultApiUrl: "https://api.solscan.io", explorerUrl: "https://solscan.io", docsUrl: "https://docs.solscan.io" },
  { id: "tron", name: "Tron (TronScan)", category: "TVM", nativeAsset: "TRX", defaultApiUrl: "https://apilist.tronscanapi.com/api", explorerUrl: "https://tronscan.org", docsUrl: "https://docs.tronscan.org" },
  { id: "bitcoin", name: "Bitcoin Mainnet (Mempool.space)", category: "UTXO", nativeAsset: "BTC", defaultApiUrl: "https://mempool.space/api", explorerUrl: "https://mempool.space", docsUrl: "https://mempool.space/docs/api" },
  { id: "linea", name: "Linea Mainnet (LineaScan)", category: "EVM", chainId: "59144", nativeAsset: "ETH", defaultApiUrl: "https://api.lineascan.build/api", explorerUrl: "https://lineascan.build", docsUrl: "https://docs.lineascan.build" },
  { id: "scroll", name: "Scroll Mainnet (ScrollScan)", category: "EVM", chainId: "534352", nativeAsset: "ETH", defaultApiUrl: "https://api.scrollscan.com/api", explorerUrl: "https://scrollscan.com", docsUrl: "https://docs.scrollscan.com" },
  { id: "zksync", name: "zkSync Era (zkSync Explorer)", category: "EVM", chainId: "324", nativeAsset: "ETH", defaultApiUrl: "https://api-era.zksync.network/api", explorerUrl: "https://era.zksync.network", docsUrl: "https://docs.zksync.io" },
  { id: "blast", name: "Blast (BlastScan)", category: "EVM", chainId: "81457", nativeAsset: "ETH", defaultApiUrl: "https://api.blastscan.io/api", explorerUrl: "https://blastscan.io", docsUrl: "https://docs.blastscan.io" },
  { id: "cronos", name: "Cronos (CronoScan)", category: "EVM", chainId: "25", nativeAsset: "CRO", defaultApiUrl: "https://api.cronoscan.com/api", explorerUrl: "https://cronoscan.com", docsUrl: "https://docs.cronoscan.com" },
  { id: "fantom", name: "Fantom / Sonic (FTMScan)", category: "EVM", chainId: "250", nativeAsset: "FTM", defaultApiUrl: "https://api.ftmscan.com/api", explorerUrl: "https://ftmscan.com", docsUrl: "https://docs.ftmscan.com" },
  { id: "gnosis", name: "Gnosis Chain (GnosisScan)", category: "EVM", chainId: "100", nativeAsset: "XDAI", defaultApiUrl: "https://api.gnosisscan.io/api", explorerUrl: "https://gnosisscan.io", docsUrl: "https://docs.gnosisscan.io" },
  { id: "celo", name: "Celo (CeloScan)", category: "EVM", chainId: "42220", nativeAsset: "CELO", defaultApiUrl: "https://api.celoscan.io/api", explorerUrl: "https://celoscan.io", docsUrl: "https://docs.celoscan.io" },
  { id: "moonbeam", name: "Moonbeam (Moonscan)", category: "EVM", chainId: "1284", nativeAsset: "GLMR", defaultApiUrl: "https://api-moonbeam.moonscan.io/api", explorerUrl: "https://moonscan.io", docsUrl: "https://docs.moonscan.io" },
  { id: "mantle", name: "Mantle (MantleScan)", category: "EVM", chainId: "5000", nativeAsset: "MNT", defaultApiUrl: "https://api.mantlescan.xyz/api", explorerUrl: "https://mantlescan.xyz", docsUrl: "https://docs.mantlescan.xyz" },
  { id: "berachain", name: "Berachain (Berascan)", category: "EVM", chainId: "80094", nativeAsset: "BERA", defaultApiUrl: "https://api.berascan.com/api", explorerUrl: "https://berascan.com", docsUrl: "https://docs.berascan.com" },
  { id: "sei", name: "Sei Network (SeiTrace)", category: "EVM", chainId: "1329", nativeAsset: "SEI", defaultApiUrl: "https://api.seitrace.com/api", explorerUrl: "https://seitrace.com", docsUrl: "https://docs.seitrace.com" },
];

export async function testScannerConnection(
  apiUrl: string,
  apiKey?: string,
  networkId?: string,
): Promise<{ readonly latencyMs: number; readonly message: string; readonly success: boolean }> {
  const started = performance.now();
  try {
    const url = new URL(apiUrl);
    if (apiKey) {
      url.searchParams.set("apikey", apiKey);
    }
    // Check EVM standard blockNumber action
    url.searchParams.set("module", "proxy");
    url.searchParams.set("action", "eth_blockNumber");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "user-agent": "OrbitOS-Scanner-Verifier/1.0" },
    });
    clearTimeout(timeout);

    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) {
      return {
        success: false,
        message: `HTTP ${res.status}: ${res.statusText}`,
        latencyMs,
      };
    }

    const data = await res.json() as Record<string, unknown>;
    if (data.status === "0" && typeof data.message === "string" && data.message.includes("NOTOK")) {
      return {
        success: false,
        message: String(data.result ?? data.message),
        latencyMs,
      };
    }

    return {
      success: true,
      message: `Scanner responsive (${latencyMs}ms). Verified block height connection.`,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Connection timed out or host unreachable",
      latencyMs,
    };
  }
}

export async function verifyTransactionOnChain(
  txHash: string,
  network: string,
  apiUrl: string,
  apiKey?: string,
): Promise<{
  readonly blockNumber?: string;
  readonly details?: string;
  readonly explorerUrl?: string;
  readonly status: "verified" | "failed" | "unverified";
  readonly verified: boolean;
}> {
  if (!txHash || !txHash.startsWith("0x")) {
    return { verified: false, status: "unverified", details: "Non-standard or missing txHash" };
  }

  const scanner = SUPPORTED_NETWORK_SCANNERS.find((s) => s.id === network.toLowerCase());
  const effectiveApiUrl = apiUrl || scanner?.defaultApiUrl;
  if (!effectiveApiUrl) {
    return { verified: false, status: "unverified", details: "No scanner API configured for network" };
  }

  try {
    const url = new URL(effectiveApiUrl);
    if (apiKey) url.searchParams.set("apikey", apiKey);
    url.searchParams.set("module", "proxy");
    url.searchParams.set("action", "eth_getTransactionReceipt");
    url.searchParams.set("txhash", txHash);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { "user-agent": "OrbitOS-Scanner-Verifier/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { verified: false, status: "unverified", details: `Scanner HTTP error ${res.status}` };
    }

    const json = await res.json() as { result?: { blockNumber?: string; status?: string } };
    const receipt = json.result;
    if (receipt && receipt.blockNumber) {
      const isSuccess = receipt.status === "0x1" || receipt.status === "1";
      const blockNum = parseInt(receipt.blockNumber, 16);
      return {
        verified: isSuccess,
        status: isSuccess ? "verified" : "failed",
        blockNumber: String(blockNum || receipt.blockNumber),
        details: isSuccess ? `Confirmed in block #${blockNum}` : "Transaction reverted on chain",
        ...(scanner?.explorerUrl ? { explorerUrl: `${scanner.explorerUrl}/tx/${txHash}` } : {}),
      };
    }

    return { verified: false, status: "unverified", details: "Transaction not yet indexed or pending" };
  } catch {
    return { verified: false, status: "unverified", details: "Scanner query failed or timed out" };
  }
}
