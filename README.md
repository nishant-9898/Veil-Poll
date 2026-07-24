# VeilPoll

VeilPoll is a Midnight Preview polling app built around one fixed contract. Any connected visitor can create unlimited polls, vote privately with 1AM, and share a poll link without exposing wallet identity on-chain.

## Links

- Deployed app: https://veil-poll-sigma.vercel.app/
- Demo video: https://drive.google.com/file/d/1AjilLCDCULXZzJIgwZxcixHgaHIn4-da/view?usp=sharing
- Contract address: `93e91bf40350d2a9c39331af111a0960d01b7db20dd34764aed0e4104844a4dd`
- Contract explorer link: `REPLACE_WITH_CONTRACT_EXPLORER_URL`
- Contract deployment record: `REPLACE_WITH_DEPLOYMENT_JSON_OR_TX_LINK`

## Screenshots

Use this as the 2x2 screenshot grid for the repo or project page. Replace each box with the final image link when you have the screenshots ready.

<table>
  <tr>
    <td>
      <strong>Dashboard</strong><br />
      <em>Replace with screenshot</em><br />
      `docs/screenshots/dashboard.png`
    </td>
    <td>
      <strong>Create poll</strong><br />
      <em>Replace with screenshot</em><br />
      `docs/screenshots/create-poll.png`
    </td>
  </tr>
  <tr>
    <td>
      <strong>Vote flow</strong><br />
      <em>Replace with screenshot</em><br />
      `docs/screenshots/vote-flow.png`
    </td>
    <td>
      <strong>Share / close</strong><br />
      <em>Replace with screenshot</em><br />
      `docs/screenshots/share-close.png`
    </td>
  </tr>
</table>

## How To Use

### Local development

```bash
npm install
npm install --prefix contract
npm run contract:compile
npm run assets:sync
npm run dev
```

Open the app at:

- `http://localhost:3000`
- `http://localhost:3000/deploy`

### In the browser

1. Connect 1AM.
2. Open the dashboard and wait for existing polls to load.
3. Click `Create poll` to create a new poll on Preview.
4. Fill in the question and options.
5. Share the generated `?poll=<id>` link.
6. Open a poll from the dashboard and vote once with your local identity.
7. If you created the poll, you can close it from the poll view.

### Contract deployment on Preview

The app uses one fixed Preview contract address. For automation or redeploying the contract itself, use the contract workspace:

```bash
cp contract/.env.preview.example contract/.env.preview
# Add exactly one MIDNIGHT_PREVIEW_* wallet secret.
npm install --prefix contract
npm run contract:deploy:preview
```

Successful deployment writes the public details to:

- `contract/.midnight-preview/deployment.json`

## Architecture

### High-level flow

1. The frontend loads the public contract state from the Preview indexer.
2. The dashboard lists every poll already stored in the fixed contract.
3. 1AM is only needed when the user wants to create a poll, vote, or close a poll.
4. The contract stores poll metadata and vote tallies by poll ID.
5. Each poll gets its own nullifier and creator commitment so private actions stay poll-scoped.

### Frontend pieces

- `app/poll-app.tsx`
  - main dashboard
  - existing poll list
  - create-vote-close flow
- `app/deploy/deploy-client.tsx`
  - create-poll screen for the fixed Preview contract
- `lib/midnight/client.ts`
  - 1AM connection
  - Preview indexer/public provider wiring
- `lib/midnight/polls.ts`
  - contract join, create, vote, close
  - dashboard state subscription
- `lib/midnight/storage.ts`
  - local identity and poll history

### Contract pieces

- `contract/src/poll.compact`
  - `createPoll(pollId, question, option0..3, optionCount)`
  - `vote(pollId, choice)`
  - `closePoll(pollId)`
  - `voteNullifier(sk, pollId)`
  - `creatorCommitment(sk, pollId)`
- `contract/src/deploy-preview.ts`
  - CLI deploy helper for Preview
- `contract/src/managed/poll`
  - generated contract bindings and ZK assets

## Contract Details

VeilPoll uses a single on-chain registry contract instead of deploying one contract per poll.

- Poll IDs are random 32-byte values.
- Poll question text and up to 4 options are stored per poll.
- Vote tallies are tracked separately for each poll.
- Creator rights are derived from a poll-scoped commitment.
- Vote privacy is enforced with a poll-scoped nullifier.
- A local identity can vote once per poll, but the same wallet can still create more polls.

Current fixed contract address:

`93e91bf40350d2a9c39331af111a0960d01b7db20dd34764aed0e4104844a4dd`

## Why Midnight

Midnight fits this app because the app needs both public coordination and private participation.

- Polls are public enough for anyone to see and share.
- Votes should not expose wallet addresses.
- Creator verification should work without turning the whole app into a visible identity trail.
- 1AM gives the browser a practical way to prove and submit transactions.
- The Preview network lets the app stay close to production-style flows while still being a development target.

## Preview Services

- RPC: `https://rpc.preview.midnight.network`
- Indexer: `https://indexer.preview.midnight.network/api/v4/graphql`
- Proof server: `https://proof-server.preprod.midnight.network/`
- Faucet: `https://midnight-tmnight-preview.nethermind.dev/`
- Explorer: `https://preview.midnightexplorer.com/`

## Runtime Alignment

- Compact compiler: `0.31.1`
- Compact language: `0.23.0`
- Compact runtime: `0.16.0`
- Compact JS: `2.5.1`
- Ledger v8: `8.1.0`
- Midnight.js: `4.1.1`
- DApp Connector API: `4.0.1`

Generated ZK assets live in `contract/src/managed/poll` and sync to `public/midnight`.

## Verification

```bash
npm run contract:compile
npm run assets:sync
npm run typecheck --prefix contract
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
npm audit --prefix contract --omit=dev
```

## Project Layout

```text
contract/src/poll.compact       Multi-poll registry contract
app/poll-app.tsx                Dashboard and poll voting UI
app/deploy/deploy-client.tsx    Create-poll page for the fixed contract
lib/midnight/client.ts          1AM Preview providers
lib/midnight/polls.ts           Dashboard state and poll actions
lib/midnight/storage.ts         Local identity and poll history
```
