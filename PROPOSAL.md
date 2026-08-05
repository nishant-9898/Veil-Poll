# VeilPoll Product Proposal

**Approved idea-list category:** Private Voting — anonymous ballots with publicly verifiable tallies  
**Builder:** Nishant  
**Submission:** Level 3 — First Quarter

## 1. What problem does this product solve?

Public blockchain polls force participants to choose between verifiability and privacy. A normal on-chain ballot can link a wallet to a vote, while a centralized survey can hide or alter results and cannot reliably prevent duplicate participation.

VeilPoll provides shareable community polls where the contract enforces valid options, one vote per private identity per poll, creator-only closing, and public aggregate tallies. It targets DAOs, online communities, event organizers, and teams that need auditable results without publishing a participant's wallet identity.

## 2. Why does this problem require privacy, and what is selectively disclosed?

A participant should not need to create a permanent public identity trail to answer a poll. VeilPoll keeps the local secret key and wallet identity private. The contract derives a one-way, poll-scoped nullifier from the secret and poll ID. That nullifier proves the same private identity has not already voted in that poll without revealing the secret itself or creating one reusable identifier across all polls.

The contract deliberately discloses the poll ID, question, options, option count, aggregate counters, closed status, creator commitment, and used nullifiers. Because each vote changes a public option counter, an observer inspecting individual state transitions may infer the selected option; VeilPoll does not claim ballot-choice secrecy against transaction-level timing analysis. Its current privacy guarantee is anonymous participation: no wallet address or local secret is stored with that choice.

## 3. How will VeilPoll use Midnight to deliver the solution?

The Compact contract is a multi-poll registry with three state-changing circuits:

- `createPoll` validates two to four choices, initializes counters, and stores a poll-scoped creator commitment.
- `vote` validates poll state and choice, rejects a repeated poll-scoped nullifier, then updates public verifiable tallies.
- `closePoll` proves knowledge of the creator's private secret through its commitment before closing voting.

The browser connects through 1AM and Midnight.js. Proof generation and private witness handling happen through the Midnight stack; the Preview indexer supplies public poll state. The frontend never sends the raw local secret to the public ledger.

## 4. What is the realistic product scope and how will success be measured?

Current Level 3 scope is one deployed Preview contract, a live web app, wallet connection, unlimited poll creation, shareable poll links, one private-identity vote per poll, creator-only poll closing, public results, automated contract tests, and CI on every push and pull request.

Next milestone is a Preprod MVP tested by community organizers. Initial success targets are:

- 10 real polls created by at least 5 organizers;
- 50 successful votes with no accepted duplicate vote for the same private identity and poll;
- at least 5 structured user-feedback responses;
- 95% or better successful create/vote/close transaction completion during the pilot;
- all contract tests and CI checks passing before each release.

Out of scope for this milestone: coercion resistance, hidden live tallies, eligibility credentials, weighted voting, and protection against transaction-timing inference. These are candidates for later iterations after validating the core workflow.

## Risks and mitigations

- **Lost browser private state:** explain local-state dependence and add export/recovery guidance before wider launch.
- **Timing inference from public counter changes:** document it clearly; later evaluate batched or commit-reveal tally designs.
- **Preview instability:** show actionable wallet/network errors and track failed transactions during pilots.
- **Sybil participation:** current contract prevents duplicate voting per private identity, not one-human-one-vote; later integrate private eligibility credentials where required.
