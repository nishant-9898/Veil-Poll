"use client";

import "@midnight-ntwrk/dapp-connector-api";
import { ContractState } from "@midnight-ntwrk/compact-runtime";
import {
  Binding,
  CostModel,
  type FinalizedTransaction,
  LedgerParameters,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
  ZswapChainState,
} from "@midnight-ntwrk/ledger-v8";
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import type {
  MidnightProviders,
  UnboundTransaction,
} from "@midnight-ntwrk/midnight-js-types";
import type {
  ConnectedAPI,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";
import type { PollPrivateState } from "@/contract/src/witnesses";
import { browserPrivateStateProvider, type PollPrivateStateId } from "./storage";

export const MIDNIGHT_NETWORK_ID = "preview" as const;
export const ZK_ASSET_PATH = "/midnight/";
export const PREVIEW_INDEXER_QUERY_URL = "https://indexer.preview.midnight.network/api/v4/graphql";
export const PREVIEW_INDEXER_WS_URL = "wss://indexer.preview.midnight.network/api/v4/graphql/ws";

// Must run before wallet detection, connection, or contract code.
setNetworkId(MIDNIGHT_NETWORK_ID);

export type PollCircuitKeys = "createPoll" | "vote" | "closePoll";
export type PollProviders = MidnightProviders<PollCircuitKeys, PollPrivateStateId, PollPrivateState>;

export type ConnectedSession = {
  api: ConnectedAPI;
  config: Awaited<ReturnType<ConnectedAPI["getConfiguration"]>>;
  providers: PollProviders;
  unshieldedAddress: string;
};

let sessionPromise: Promise<ConnectedSession> | null = null;

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const fromHex = (value: string): Uint8Array => {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (normalized.length % 2 !== 0) throw new Error("Invalid hex string from 1AM");
  return Uint8Array.from(
    normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  );
};

export async function detect1AM(): Promise<InitialAPI | null> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const wallet = window.midnight?.["1am"];
    if (wallet) return wallet;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return null;
}

function createPatchedPublicDataProvider(queryUrl: string, subscriptionUrl: string) {
  const base = indexerPublicDataProvider(queryUrl, subscriptionUrl);

  const queryLatest = async (query: string, address: string) => {
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { address } }),
    });
    if (!response.ok) throw new Error(`Indexer HTTP error: ${response.status}`);
    const payload = await response.json() as {
      data?: { contractAction?: {
        state: string;
        zswapState?: string;
        transaction?: { block?: { ledgerParameters?: string } };
      } };
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }
    return payload.data?.contractAction ?? null;
  };

  return {
    ...base,
    async queryContractState(contractAddress: string, config?: Parameters<typeof base.queryContractState>[1]) {
      if (config) return base.queryContractState(contractAddress, config);
      const action = await queryLatest(
        `query LATEST_CONTRACT_STATE($address: HexEncoded!) {
          contractAction(address: $address) { state }
        }`,
        contractAddress,
      );
      return action ? ContractState.deserialize(fromHex(action.state)) : null;
    },
    async queryZSwapAndContractState(
      contractAddress: string,
      config?: Parameters<typeof base.queryZSwapAndContractState>[1],
    ) {
      if (config) return base.queryZSwapAndContractState(contractAddress, config);
      const action = await queryLatest(
        `query LATEST_BOTH_STATE($address: HexEncoded!) {
          contractAction(address: $address) {
            state
            zswapState
            transaction { block { ledgerParameters } }
          }
        }`,
        contractAddress,
      );
      if (!action?.zswapState) return null;
      return [
        ZswapChainState.deserialize(fromHex(action.zswapState)),
        ContractState.deserialize(fromHex(action.state)),
        action.transaction?.block?.ledgerParameters
          ? LedgerParameters.deserialize(fromHex(action.transaction.block.ledgerParameters))
          : LedgerParameters.initialParameters(),
      ] as [ZswapChainState, ContractState, LedgerParameters];
    },
  };
}

export function createPreviewPublicDataProvider() {
  return createPatchedPublicDataProvider(
    PREVIEW_INDEXER_QUERY_URL,
    PREVIEW_INDEXER_WS_URL,
  );
}

async function initialize(): Promise<ConnectedSession> {
  setNetworkId(MIDNIGHT_NETWORK_ID);

  const wallet = await detect1AM();
  if (!wallet) throw new Error("1AM wallet not detected. Install 1AM browser extension.");

  const api = await wallet.connect(MIDNIGHT_NETWORK_ID);
  const [config, unshielded, shielded] = await Promise.all([
    api.getConfiguration(),
    api.getUnshieldedAddress(),
    api.getShieldedAddresses(),
  ]);

  if (config.networkId !== MIDNIGHT_NETWORK_ID) {
    throw new Error(`1AM connected to ${config.networkId}; switch wallet to preview.`);
  }

  const zkConfigProvider = new FetchZkConfigProvider<PollCircuitKeys>(
    new URL(ZK_ASSET_PATH, window.location.origin).toString(),
    window.fetch.bind(window),
  );
  const provingProvider = await api.getProvingProvider(zkConfigProvider);

  const providers: PollProviders = {
    privateStateProvider: browserPrivateStateProvider(),
    zkConfigProvider,
    proofProvider: {
      proveTx: async (unprovenTx) =>
        unprovenTx.prove(provingProvider, CostModel.initialCostModel()),
    },
    publicDataProvider: createPatchedPublicDataProvider(
      config.indexerUri,
      config.indexerWsUri,
    ),
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const balanced = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
        if (!balanced.tx) throw new Error("1AM returned invalid balanced transaction");
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          "signature",
          "proof",
          "binding",
          fromHex(balanced.tx),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await api.submitTransaction(toHex(tx.serialize()));
        const id = tx.identifiers()[0];
        if (!id) throw new Error("Transaction has no identifier");
        return id;
      },
    },
  };

  return {
    api,
    config,
    providers,
    unshieldedAddress: unshielded.unshieldedAddress,
  };
}

export function connect1AM(): Promise<ConnectedSession> {
  return sessionPromise ?? (sessionPromise = initialize().catch((error) => {
    sessionPromise = null;
    throw error;
  }));
}

export async function connectProviders(): Promise<PollProviders> {
  return (await connect1AM()).providers;
}

export async function pollForContractState(
  queryUrl: string,
  contractAddress: string,
  onAttempt?: (attempt: number) => void,
  maxAttempts = 120,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    onAttempt?.(attempt);
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($address: HexEncoded!) {
          contractAction(address: $address) { state }
        }`,
        variables: { address: contractAddress },
      }),
    });
    const payload = await response.json() as { data?: { contractAction?: unknown } };
    if (payload.data?.contractAction) return;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("Contract submitted, but Preview indexer confirmation timed out");
}
