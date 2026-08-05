import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type ChargedState,
} from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger, pureCircuits, type Ledger } from "./managed/poll/contract/index.js";
import { createPollPrivateState, witnesses, type PollPrivateState } from "./witnesses.js";

const bytes = (value: number): Uint8Array => new Uint8Array(32).fill(value);
const coinPublicKey = { bytes: bytes(0) };

class PollHarness {
  readonly contract = new Contract<PollPrivateState>(witnesses);
  readonly address = sampleContractAddress();
  state: ChargedState;

  constructor(initialPrivateState: PollPrivateState) {
    this.state = this.contract.initialState(
      createConstructorContext(initialPrivateState, coinPublicKey),
    ).currentContractState.data;
  }

  private context(privateState: PollPrivateState) {
    return createCircuitContext(
      this.address,
      coinPublicKey,
      this.state,
      privateState,
    );
  }

  private apply(nextState: ChargedState): void {
    this.state = nextState;
  }

  createPoll(
    privateState: PollPrivateState,
    pollId: Uint8Array,
    optionCount = 2n,
  ): void {
    const result = this.contract.circuits.createPoll(
      this.context(privateState),
      pollId,
      "Should the community fund proposal A?",
      "Yes",
      "No",
      "Abstain",
      "More discussion",
      optionCount,
    );
    this.apply(result.context.currentQueryContext.state);
  }

  vote(privateState: PollPrivateState, pollId: Uint8Array, choice: bigint): void {
    const result = this.contract.circuits.vote(
      this.context(privateState),
      pollId,
      choice,
    );
    this.apply(result.context.currentQueryContext.state);
  }

  closePoll(privateState: PollPrivateState, pollId: Uint8Array): void {
    const result = this.contract.circuits.closePoll(
      this.context(privateState),
      pollId,
    );
    this.apply(result.context.currentQueryContext.state);
  }

  ledger(): Ledger {
    return ledger(this.state);
  }
}

describe("VeilPoll Compact contract", () => {
  it("enforces circuit input rules and initializes a valid poll", () => {
    const creator = createPollPrivateState(bytes(1));
    const pollId = bytes(11);
    const harness = new PollHarness(creator);

    assert.throws(
      () => harness.createPoll(creator, pollId, 1n),
      /Poll must have two to four options/,
    );

    harness.createPoll(creator, pollId, 3n);
    const state = harness.ledger();
    assert.equal(state.pollIds.member(pollId), true);
    assert.equal(state.questions.lookup(pollId), "Should the community fund proposal A?");
    assert.equal(state.optionCounts.lookup(pollId), 3n);
    assert.equal(state.totalVotes.lookup(pollId), 0n);

    assert.throws(
      () => harness.vote(createPollPrivateState(bytes(2)), pollId, 3n),
      /Invalid poll option/,
    );
  });

  it("tracks vote and close state transitions", () => {
    const creator = createPollPrivateState(bytes(3));
    const voter = createPollPrivateState(bytes(4));
    const pollId = bytes(12);
    const harness = new PollHarness(creator);

    harness.createPoll(creator, pollId, 2n);
    harness.vote(voter, pollId, 1n);

    let state = harness.ledger();
    assert.equal(state.totalVotes.lookup(pollId), 1n);
    assert.equal(state.votes0.lookup(pollId), 0n);
    assert.equal(state.votes1.lookup(pollId), 1n);

    assert.throws(
      () => harness.closePoll(voter, pollId),
      /Only poll creator can close this poll/,
    );

    harness.closePoll(creator, pollId);
    state = harness.ledger();
    assert.equal(state.closedPolls.member(pollId), true);
    assert.throws(() => harness.vote(createPollPrivateState(bytes(5)), pollId, 0n), /Poll is closed/);
  });

  it("prevents repeat voting without exposing or globally linking private identities", () => {
    const creator = createPollPrivateState(bytes(6));
    const voter = createPollPrivateState(bytes(7));
    const otherVoter = createPollPrivateState(bytes(8));
    const firstPollId = bytes(13);
    const secondPollId = bytes(14);
    const harness = new PollHarness(creator);

    const firstNullifier = pureCircuits.voteNullifier(voter.secretKey, firstPollId);
    const repeatedNullifier = pureCircuits.voteNullifier(voter.secretKey, firstPollId);
    const otherPollNullifier = pureCircuits.voteNullifier(voter.secretKey, secondPollId);
    const otherVoterNullifier = pureCircuits.voteNullifier(otherVoter.secretKey, firstPollId);

    assert.deepEqual(firstNullifier, repeatedNullifier);
    assert.notDeepEqual(firstNullifier, otherPollNullifier);
    assert.notDeepEqual(firstNullifier, otherVoterNullifier);
    assert.notDeepEqual(firstNullifier, voter.secretKey);

    harness.createPoll(creator, firstPollId);
    harness.createPoll(creator, secondPollId);
    harness.vote(voter, firstPollId, 0n);
    assert.throws(
      () => harness.vote(voter, firstPollId, 1n),
      /This private identity already voted/,
    );

    harness.vote(voter, secondPollId, 1n);
    const state = harness.ledger();
    assert.equal(state.usedNullifiers.member(firstNullifier), true);
    assert.equal(state.usedNullifiers.member(otherPollNullifier), true);
    assert.equal(state.totalVotes.lookup(firstPollId), 1n);
    assert.equal(state.totalVotes.lookup(secondPollId), 1n);
  });
});
