import type { ContractAddress, SigningKey } from "@midnight-ntwrk/compact-runtime";
import type {
  ImportPrivateStatesOptions,
  ImportPrivateStatesResult,
  ImportSigningKeysResult,
  PrivateStateExport,
  PrivateStateProvider,
  SigningKeyExport,
} from "@midnight-ntwrk/midnight-js-types";
import type { PollPrivateState } from "@/contract/src/witnesses";
import { VEILPOLL_CONTRACT_ADDRESS } from "./constants";

const PRIVATE_STATE_ID = "veilPollPrivateState" as const;
const IDENTITY_KEY = "veilpoll.identity.v1";
const REGISTRY_KEY = "veilpoll.registry.preview.v2";
const POLLS_KEY = "veilpoll.polls.preview.v2";

export type PollPrivateStateId = typeof PRIVATE_STATE_ID;
export type KnownPoll = {
  contractAddress: string;
  pollId: string;
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const unhex = (value: string) =>
  Uint8Array.from(value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);

export function getOrCreateIdentity(): PollPrivateState {
  const stored = window.localStorage.getItem(IDENTITY_KEY);
  if (stored && /^[0-9a-f]{64}$/i.test(stored)) {
    return { secretKey: unhex(stored) };
  }
  const secretKey = crypto.getRandomValues(new Uint8Array(32));
  window.localStorage.setItem(IDENTITY_KEY, hex(secretKey));
  return { secretKey };
}

export function knownRegistry(): string {
  return VEILPOLL_CONTRACT_ADDRESS;
}

export function rememberRegistry(contractAddress: string): void {
  void contractAddress;
  window.localStorage.setItem(REGISTRY_KEY, VEILPOLL_CONTRACT_ADDRESS);
}

export function knownPolls(): KnownPoll[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(POLLS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is KnownPoll =>
            typeof item === "object" &&
            item !== null &&
            typeof item.pollId === "string",
        ).map((item) => ({
          contractAddress: VEILPOLL_CONTRACT_ADDRESS,
          pollId: item.pollId,
        }))
      : [];
  } catch {
    return [];
  }
}

export function rememberPoll(contractAddress: string, pollId: string): void {
  void contractAddress;
  const next = [
    { contractAddress: VEILPOLL_CONTRACT_ADDRESS, pollId },
    ...knownPolls().filter((item) => item.pollId !== pollId),
  ].slice(0, 100);
  window.localStorage.setItem(POLLS_KEY, JSON.stringify(next));
  rememberRegistry(VEILPOLL_CONTRACT_ADDRESS);
}

export function browserPrivateStateProvider(): PrivateStateProvider<
  PollPrivateStateId,
  PollPrivateState
> {
  const states = new Map<ContractAddress, PollPrivateState>();
  const signingKeys = new Map<ContractAddress, SigningKey>();
  let current: ContractAddress | null = null;
  const address = () => {
    if (!current) throw new Error("Contract address is not set");
    return current;
  };

  return {
    setContractAddress(value) {
      current = value;
    },
    async set(_id, state) {
      states.set(address(), state);
    },
    async get() {
      return states.get(address()) ?? null;
    },
    async remove() {
      states.delete(address());
    },
    async clear() {
      states.delete(address());
    },
    async setSigningKey(contractAddress, key) {
      signingKeys.set(contractAddress, key);
    },
    async getSigningKey(contractAddress) {
      return signingKeys.get(contractAddress) ?? null;
    },
    async removeSigningKey(contractAddress) {
      signingKeys.delete(contractAddress);
    },
    async clearSigningKeys() {
      signingKeys.clear();
    },
    async exportPrivateStates(): Promise<PrivateStateExport> {
      const state = states.get(address()) ?? getOrCreateIdentity();
      return {
        format: "midnight-private-state-export",
        encryptedPayload: JSON.stringify({ secretKey: hex(state.secretKey) }),
        salt: "veilpoll-browser-v1",
      };
    },
    async importPrivateStates(
      value: PrivateStateExport,
      _options?: ImportPrivateStatesOptions,
    ): Promise<ImportPrivateStatesResult> {
      void _options;
      const parsed = JSON.parse(value.encryptedPayload) as { secretKey?: string };
      if (!parsed.secretKey || !/^[0-9a-f]{64}$/i.test(parsed.secretKey)) {
        throw new Error("Invalid VeilPoll private state");
      }
      states.set(address(), { secretKey: unhex(parsed.secretKey) });
      return { imported: 1, skipped: 0, overwritten: 0 };
    },
    async exportSigningKeys(): Promise<SigningKeyExport> {
      return {
        format: "midnight-signing-key-export",
        encryptedPayload: JSON.stringify({}),
        salt: "veilpoll-browser-v1",
      };
    },
    async importSigningKeys(): Promise<ImportSigningKeysResult> {
      return { imported: 0, skipped: 0, overwritten: 0 };
    },
  };
}

export { PRIVATE_STATE_ID };
