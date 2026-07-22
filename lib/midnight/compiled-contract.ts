import { CompiledContract } from "@midnight-ntwrk/compact-js";
import * as Poll from "@/contract/src/managed/poll/contract/index.js";
import {
  witnesses,
  type PollPrivateState,
} from "@/contract/src/witnesses";

export type PollContract = Poll.Contract<
  PollPrivateState,
  Poll.Witnesses<PollPrivateState>
>;

// This must be constructed from the app's root compact-js instance. compact-js
// stores context under a module-local Symbol, so constructing this from the
// contract workspace's second package instance breaks Midnight.js at runtime.
export const CompiledPollContract = CompiledContract.make<PollContract>(
  "VeilPoll",
  Poll.Contract<PollPrivateState>,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets("/midnight/"),
);
