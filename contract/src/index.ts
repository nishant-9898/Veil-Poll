import { CompiledContract } from "@midnight-ntwrk/compact-js";
import * as Poll from "./managed/poll/contract/index.js";
import { witnesses, type PollPrivateState } from "./witnesses";

export * from "./managed/poll/contract/index.js";
export * from "./witnesses";

export const CompiledPollContract = CompiledContract.make<
  Poll.Contract<PollPrivateState>
>("VeilPoll", Poll.Contract<PollPrivateState>).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("/midnight/"),
);
