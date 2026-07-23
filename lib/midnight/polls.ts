import { findDeployedContract, type FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type { ContractAddress } from "@midnight-ntwrk/compact-runtime";
import { firstValueFrom, map, type Observable } from "rxjs";
import * as Generated from "@/contract/src/managed/poll/contract/index.js";
import type { PollPrivateState } from "@/contract/src/witnesses";
import { VEILPOLL_CONTRACT_ADDRESS } from "./constants";
import {
  CompiledPollContract,
  type PollContract,
} from "./compiled-contract";
import { connectProviders, fromHex, toHex, type PollProviders } from "./client";
import {
  getOrCreateIdentity,
  PRIVATE_STATE_ID,
  rememberPoll,
} from "./storage";

export type PollHandle = FoundContract<PollContract>;

export type PollState = {
  contractAddress: string;
  pollId: string;
  question: string;
  options: string[];
  votes: bigint[];
  totalVotes: bigint;
  closed: boolean;
  isCreator: boolean;
  hasVoted: boolean;
};

export type DashboardPoll = PollState;

export type NewPoll = {
  question: string;
  options: string[];
};

export const normalizeContractAddress = (value: string): ContractAddress => {
  const clean = value.trim().toLowerCase().replace(/^0x/, "");
  const fixed = VEILPOLL_CONTRACT_ADDRESS.toLowerCase();
  if (clean !== fixed && clean !== `0x${fixed}`) {
    throw new Error("VeilPoll uses a fixed Preview contract address.");
  }
  return VEILPOLL_CONTRACT_ADDRESS as ContractAddress;
};

export const normalizePollId = (value: string): string => {
  const clean = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error("Invalid poll ID");
  return clean;
};

const derive = (
  contractAddress: string,
  pollId: string,
  state: Generated.Ledger,
  privateState: PollPrivateState,
): PollState => {
  const id = fromHex(pollId);
  if (!state.pollIds.member(id)) throw new Error("Poll not found in this contract");
  const optionCount = Number(state.optionCounts.lookup(id));
  const votes = [
    state.votes0.lookup(id),
    state.votes1.lookup(id),
    state.votes2.lookup(id),
    state.votes3.lookup(id),
  ].slice(0, optionCount);
  const creator = Generated.pureCircuits.creatorCommitment(
    privateState.secretKey,
    id,
  );
  const nullifier = Generated.pureCircuits.voteNullifier(privateState.secretKey, id);
  return {
    contractAddress,
    pollId,
    question: state.questions.lookup(id),
    options: [
      state.option0.lookup(id),
      state.option1.lookup(id),
      state.option2.lookup(id),
      state.option3.lookup(id),
    ].slice(0, optionCount),
    votes,
    totalVotes: state.totalVotes.lookup(id),
    closed: state.closedPolls.member(id),
    isCreator: toHex(creator) === toHex(state.creators.lookup(id)),
    hasVoted: state.usedNullifiers.member(nullifier),
  };
};

const collect = (
  contractAddress: string,
  state: Generated.Ledger,
  privateState: PollPrivateState,
): PollState[] => {
  const entries: PollState[] = [];
  for (const pollId of state.pollIds) {
    entries.push(
      derive(contractAddress, toHex(pollId), state, privateState),
    );
  }
  return entries;
};

export async function deployRegistry(): Promise<string> {
  throw new Error(
    "VeilPoll uses a fixed Preview contract and does not deploy new registries.",
  );
}

export async function joinRegistry(rawAddress: string): Promise<{
  handle: PollHandle;
  contractAddress: string;
}> {
  const contractAddress = normalizeContractAddress(rawAddress);
  const providers = await connectProviders();
  const handle = await findDeployedContract<PollContract>(providers, {
    contractAddress,
    compiledContract: CompiledPollContract,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: getOrCreateIdentity(),
  });
  return { handle, contractAddress };
}

export async function createPoll(
  handle: PollHandle,
  contractAddress: string,
  input: NewPoll,
): Promise<{ pollId: string; txHash: string }> {
  const id = crypto.getRandomValues(new Uint8Array(32));
  const pollId = toHex(id);
  const options = [...input.options, "", "", ""].slice(0, 4);
  const result = await handle.callTx.createPoll(
    id,
    input.question,
    options[0]!,
    options[1]!,
    options[2]!,
    options[3]!,
    BigInt(input.options.length),
  );
  rememberPoll(contractAddress, pollId);
  return { pollId, txHash: result.public.txHash };
}

export async function joinPoll(
  rawContractAddress: string,
  rawPollId: string,
): Promise<{ handle: PollHandle; contractAddress: string; pollId: string }> {
  const pollId = normalizePollId(rawPollId);
  const joined = await joinRegistry(rawContractAddress);
  rememberPoll(joined.contractAddress, pollId);
  return { ...joined, pollId };
}

export function pollState$(
  providers: PollProviders,
  contractAddress: string,
  pollId: string,
): Observable<PollState> {
  const identity = getOrCreateIdentity();
  return providers.publicDataProvider
    .contractStateObservable(contractAddress as ContractAddress, { type: "latest" })
    .pipe(
      map((state) =>
        derive(
          contractAddress,
          pollId,
          Generated.ledger(state.data),
          identity,
        ),
      ),
    );
}

export function dashboardPolls$(
  providers: Pick<PollProviders, "publicDataProvider">,
  contractAddress: string,
): Observable<PollState[]> {
  const identity = getOrCreateIdentity();
  return providers.publicDataProvider
    .contractStateObservable(contractAddress as ContractAddress, { type: "latest" })
    .pipe(
      map((state) =>
        collect(
          contractAddress,
          Generated.ledger(state.data),
          identity,
        ),
      ),
    );
}

export async function loadPollState(
  contractAddress: string,
  pollId: string,
): Promise<PollState> {
  return firstValueFrom(
    pollState$(await connectProviders(), contractAddress, pollId),
  );
}

export async function castVote(
  handle: PollHandle,
  pollId: string,
  option: number,
): Promise<string> {
  const result = await handle.callTx.vote(fromHex(pollId), BigInt(option));
  return result.public.txHash;
}

export async function closePoll(
  handle: PollHandle,
  pollId: string,
): Promise<string> {
  const result = await handle.callTx.closePoll(fromHex(pollId));
  return result.public.txHash;
}
