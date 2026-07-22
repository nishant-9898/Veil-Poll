import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import type { Ledger } from "./managed/poll/contract/index.js";

export type PollPrivateState = {
  readonly secretKey: Uint8Array;
};

export const createPollPrivateState = (secretKey: Uint8Array): PollPrivateState => ({
  secretKey,
});

export const witnesses = {
  localSecretKey: ({
    privateState,
  }: WitnessContext<Ledger, PollPrivateState>): [PollPrivateState, Uint8Array] => [
    privateState,
    privateState.secretKey,
  ],
};
