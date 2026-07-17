# VeilPoll

Midnight Preview poll DApp using 1AM. One fixed Preview contract stores any
number of polls. Any connected visitor can create a poll, vote once with their
local private identity, share its link, or close a poll they created.

## Browser flow on Preview

```bash
npm ci
npm ci --prefix contract
npm run contract:compile
npm run assets:sync
npm run dev
```

Open [http://localhost:3000/deploy](http://localhost:3000/deploy):

1. Switch 1AM to Midnight Preview.
2. Connect 1AM.
3. Create poll inside the fixed Preview contract.
4. Share generated `?poll=<id>` link.

The app is hardcoded to this Preview contract:

`93e91bf40350d2a9c39331af111a0960d01b7db20dd34764aed0e4104844a4dd`

Old `?contract=<address>&poll=<id>` links still work if the contract matches
the fixed Preview contract, but the UI never asks for an address.

## Contract model

`contract/src/poll.compact` exposes:

- `createPoll(pollId, question, option0..3, optionCount)`
- `vote(pollId, choice)`
- `closePoll(pollId)`

Random 32-byte poll IDs let unrelated creators add polls without global ID
contention. Ledger maps hold metadata and tallies per poll. Creator commitments
and vote nullifiers include poll ID, so creator rights and one-vote checks stay
poll-scoped. No fixed poll-count limit exists in contract logic; practical
growth remains bounded by network resources.

Wallet address and local voting secret never enter ledger. Poll metadata,
choices, totals, creator commitments, and nullifiers are public. This blocks
repeat votes from same persisted local identity, not one-human-one-vote across
devices.

## Deploy registry on Preview from CLI

Browser deployment is preferred. CLI path supports automation with funded
Preview wallet:

```bash
cp contract/.env.preview.example contract/.env.preview
# Fill exactly one MIDNIGHT_PREVIEW_* wallet secret.
npm ci --prefix contract
npm run contract:deploy:preview
```

Successful deployment writes public details to
`contract/.midnight-preview/deployment.json`. Private state and signing key stay
in same ignored directory.

Preview services:

- RPC: `https://rpc.preview.midnight.network`
- Indexer: `https://indexer.preview.midnight.network/api/v4/graphql`
- Proof server: `https://proof-server.preprod.midnight.network/`
- Faucet: `https://midnight-tmnight-preview.nethermind.dev/`
- Explorer: `https://preview.midnightexplorer.com/`

## Runtime alignment

- Compact compiler: `0.31.1`
- Compact language: `0.23.0`
- Compact runtime: `0.16.0`
- Compact JS: `2.5.1`
- Ledger v8: `8.1.0`
- Midnight.js: `4.1.1`
- DApp Connector API: `4.0.1`

Generated ZK assets live in `contract/src/managed/poll` and sync to
`public/midnight`.

## Verify

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

Main files:

```text
contract/src/poll.compact       Multi-poll registry contract
app/deploy/deploy-client.tsx    Fixed-contract poll creation UI
app/poll-app.tsx                Shared-link voting UI
lib/midnight/client.ts          1AM Preview providers
lib/midnight/polls.ts           Registry deploy/join/create/vote/close
```
