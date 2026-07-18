import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import {
  DustSecretKey,
  LedgerParameters,
  ZswapSecretKeys,
  type CoinPublicKey,
  type EncPublicKey,
  type FinalizedTransaction,
} from "@midnight-ntwrk/midnight-js-protocol/ledger";
import {
  deployContract,
  type DeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import type {
  MidnightProvider,
  MidnightProviders,
  UnboundTransaction,
  WalletProvider,
} from "@midnight-ntwrk/midnight-js-types";
import { ttlOneHour } from "@midnight-ntwrk/midnight-js-utils";
import {
  FluentWalletBuilder,
  waitForFunds,
  type DustWalletOptions,
  type EnvironmentConfiguration,
} from "@midnight-ntwrk/testkit-js";
import type {
  FacadeState,
  UnshieldedKeystore,
  WalletFacade,
} from "@midnight-ntwrk/wallet-sdk";
import pino from "pino";
import * as Rx from "rxjs";
import { WebSocket } from "ws";
import * as Poll from "./managed/poll/contract/index.js";
import {
  createPollPrivateState,
  witnesses,
  type PollPrivateState,
} from "./witnesses.js";

const NETWORK = "preview";
const PRIVATE_STATE_ID = "veilPollPrivateState";
const PREVIEW = {
  walletNetworkId: NETWORK,
  networkId: NETWORK,
  indexer: "https://indexer.preview.midnight.network/api/v4/graphql",
  indexerWS: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
  node: "https://rpc.preview.midnight.network",
  nodeWS: "wss://rpc.preview.midnight.network",
  proofServer:
    process.env.MIDNIGHT_PROOF_SERVER ??
    "https://proof-server.preprod.midnight.network/",
  faucet: "https://midnight-tmnight-preview.nethermind.dev/",
} satisfies EnvironmentConfiguration;

type PollContract = Poll.Contract<PollPrivateState>;
type PollCircuits = "createPoll" | "vote" | "closePoll";
type PollProviders = MidnightProviders<
  PollCircuits,
  typeof PRIVATE_STATE_ID,
  PollPrivateState
>;
type WalletSecret =
  | { kind: "mnemonic"; value: string }
  | { kind: "seed"; value: string };

globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
setNetworkId(NETWORK);

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["secret", "*.secret", "mnemonic", "seed"],
});

function walletSecret(): WalletSecret {
  const mnemonic = process.env.MIDNIGHT_PREVIEW_MNEMONIC?.trim().replace(/\s+/g, " ");
  const seed = process.env.MIDNIGHT_PREVIEW_SEED?.trim();

  if (mnemonic && seed) {
    throw new Error(
      "Set only one of MIDNIGHT_PREVIEW_MNEMONIC or MIDNIGHT_PREVIEW_SEED",
    );
  }
  if (mnemonic) return { kind: "mnemonic", value: mnemonic };
  if (seed) {
    if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
      throw new Error("MIDNIGHT_PREVIEW_SEED must contain exactly 64 hex characters");
    }
    return { kind: "seed", value: seed };
  }
  throw new Error(
    "Set MIDNIGHT_PREVIEW_MNEMONIC or MIDNIGHT_PREVIEW_SEED in contract/.env.preview",
  );
}

function strictlyComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== "object") return false;
  const method = (progress as { isStrictlyComplete?: unknown }).isStrictlyComplete;
  return typeof method === "function" && (method as () => boolean)();
}

async function syncWallet(wallet: WalletFacade): Promise<FacadeState> {
  const timeout = Number(process.env.MIDNIGHT_SYNC_TIMEOUT_MS ?? 60 * 60_000);
  logger.info({ network: NETWORK }, "Syncing wallet");
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.filter(
        (state) =>
          strictlyComplete(state.shielded.state.progress) &&
          strictlyComplete(state.unshielded.progress) &&
          strictlyComplete(state.dust.state.progress),
      ),
      Rx.timeout({
        each: timeout,
        with: () => Rx.throwError(() => new Error(`Wallet sync timed out after ${timeout}ms`)),
      }),
    ),
  );
}

class PreviewWallet implements WalletProvider, MidnightProvider {
  private constructor(
    readonly wallet: WalletFacade,
    readonly unshieldedKeystore: UnshieldedKeystore,
    private readonly zswapSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
  ) {}

  static async build(secret: WalletSecret): Promise<PreviewWallet> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };
    const base = FluentWalletBuilder.forEnvironment(PREVIEW).withDustOptions(dustOptions);
    const builder =
      secret.kind === "mnemonic"
        ? base.withMnemonic(secret.value)
        : base.withSeed(secret.value);
    const result = await builder.buildWithoutStarting();
    return new PreviewWallet(
      result.wallet,
      result.keystore,
      ZswapSecretKeys.fromSeed(result.seeds.shielded),
      DustSecretKey.fromSeed(result.seeds.dust),
    );
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.zswapSecretKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.zswapSecretKeys.encryptionPublicKey;
  }

  async balanceTx(
    tx: UnboundTransaction,
    ttl: Date = ttlOneHour(),
  ): Promise<FinalizedTransaction> {
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      {
        shieldedSecretKeys: this.zswapSecretKeys,
        dustSecretKey: this.dustSecretKey,
      },
      { ttl },
    );
    return this.wallet.finalizeRecipe(recipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  start(): Promise<void> {
    return this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
  }

  stop(): Promise<void> {
    return this.wallet.stop();
  }
}

async function main(): Promise<void> {
  const secret = walletSecret();
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const zkConfigPath = path.resolve(currentDir, "managed", "poll");
  const stateDir = path.resolve(currentDir, "..", ".midnight-preview");
  await mkdir(stateDir, { recursive: true });

  const compiledContract = CompiledContract.make<PollContract>(
    "VeilPoll",
    Poll.Contract<PollPrivateState>,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  const wallet = await PreviewWallet.build(secret);
  try {
    await wallet.start();
    await syncWallet(wallet.wallet);
    await waitForFunds(wallet.wallet, PREVIEW, false, wallet.unshieldedKeystore);

    const zkConfigProvider = new NodeZkConfigProvider<PollCircuits>(zkConfigPath);
    const providers: PollProviders = {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: path.join(stateDir, "private-state"),
        signingKeyStoreName: path.join(stateDir, "signing-keys"),
        privateStoragePasswordProvider: () => secret.value,
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(
        PREVIEW.indexer,
        PREVIEW.indexerWS,
      ),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PREVIEW.proofServer, zkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    };

    const result: DeployedContract<PollContract> = await deployContract(providers, {
      compiledContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: createPollPrivateState(randomBytes(32)),
    });
    const contractAddress = result.deployTxData.public.contractAddress;
    const deployment = {
      network: NETWORK,
      contractAddress,
      deployedAt: new Date().toISOString(),
      explorer: "https://preview.midnightexplorer.com/",
    };
    await writeFile(
      path.join(stateDir, "deployment.json"),
      `${JSON.stringify(deployment, null, 2)}\n`,
      { mode: 0o600 },
    );
    logger.info(deployment, "VeilPoll deployed");
  } finally {
    await wallet.stop();
  }
}

main().catch((error: unknown) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Preview deployment failed",
  );
  process.exitCode = 1;
});
