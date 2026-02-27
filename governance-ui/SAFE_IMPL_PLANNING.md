# What the UI Needs from the Solana Program Developer

## Context

The governance-ui DisputeSafe integration has the enum scaffolding in place
(PackageEnum, Instructions, instructionsMap, null stubs in new.tsx — all committed).
The next phase is building the 6 instruction form components and any read-only display
helpers. Everything below is blocked on deliverables from the program developer.

---

## Deliverables Needed (ordered by blocking priority)

### 1. Compiled IDL JSON — blocks everything

`anchor build` produces `target/idl/safe_treasury.json`.

Required to:
- Get exact 8-byte instruction discriminators (Borsh layout is order-sensitive)
- Instantiate `@coral-xyz/anchor`'s `Program` class to call `.methods.*()` safely
- Confirm account field order matches what we read from source

**Ask:** Share the IDL JSON from a successful `anchor build`. Does not need a live deploy.

---

### 2. Deployed Program Address — blocks devnet testing

Source has placeholder `SafeTreasury1111111111111111111111111111111`.

**Ask:** Provide the real program ID string for devnet (and mainnet when ready).

---

### 3. TypeScript Client / Generated Types — blocks form instruction building

The form components need to build a `TransactionInstruction`. Options:

| Option | What to provide |
|--------|-----------------|
| **A (preferred)** | Publish an npm package (e.g. `@dispute-safe/sdk`) with typed instruction builders and PDA helpers |
| **B** | Run Codama or `anchor-client-gen` on the IDL; share the output files |
| **C** | Raw IDL only — UI will use `Program.methods.*()` from `@coral-xyz/anchor` directly |

Option C requires only item 1. Options A/B are preferred for type safety.

---

### 4. `authorization_mode = 1` Payload Hash Spec — blocks QueuePayout and RecordRuling forms

Two instructions accept `authorization_mode: 1` (proposal-proof mode):
- `queue_payout` — args: `payload_hash`, `proposal_owner`, `proposal_signatory`
- `record_ruling` — same optional fields

**Questions for the developer:**
- What is the preimage of `payload_hash`? (SHA-256 of what — the serialized ix? proposal title + nonce?)
- Is there a helper function that computes it from the instruction args?
- What pubkey goes in `proposal_owner` in the DAO context — the governance PDA? the realm?
- What pubkey goes in `proposal_signatory` — the proposal transaction signer?

This is the single most ambiguous part of the API from a UI perspective.

---

### 5. `payout_id` Computation — blocks QueuePayout form

`Payout.payout_id` is "SHA-256 truncated to u64 (from args)" per state.rs.

**Questions:**
- Is `payout_id` caller-supplied in `QueuePayoutArgs`, or derived by the program from other args?
- If caller-supplied: what is the recommended input to hash?
- If program-derived: does the UI ever need to compute it, or is it only an event/display field?

---

### 6. Challenge Eligibility Mint Guidance — blocks ChallengePayout form

`safe_policy.eligibility_mint` and `safe_policy.min_token_balance` are per-policy fields.
The challenger must hold ≥ `min_token_balance` of this mint.

**Questions:**
- Is there a canonical devnet mint address for testing?
- Can `eligibility_mint` be all-zeros / SystemProgram ID to mean "no eligibility check"?
- Should the UI read the live policy and display "You need X tokens of mint Y" before submitting?

---

### 7. Devnet Test Fixtures — blocks end-to-end UI testing

To develop and test the UI forms against real on-chain data:
- A `SafePolicy` account address (so PDAs can be derived and policy params read)
- Ideally a `Payout` in Queued status (to test ChallengePayout form)

**Ask:** Share the devnet safe address and policy authority pubkey used in dev/testing.

---

## What the UI Already Has (no further input needed)

| Item | Status |
|------|--------|
| PackageEnum + Instructions enum entries | ✅ committed |
| useGovernanceAssets wiring (6 entries) | ✅ committed |
| null stubs in new.tsx | ✅ committed |
| All PDA seed formulas | ✅ derived from source |
| All account field names + types | ✅ derived from source |
| All error codes (6000–6034) | ✅ derived from source |
| Event schema (10 events) | ✅ derived from source |
| InstructionForm / yup / serializeInstructionToBase64 patterns | ✅ understood |

---

## What the UI Will Build Once Unblocked

Once items 1–3 (IDL, program ID, TS client/types) are delivered:

1. `governance-ui/utils/instructions/disputeSafe/pdas.ts`
   — PDA derivation helpers for SafePolicy, Payout, Challenge, NativeVault, SplVault, ChallengeBondVault

2. `governance-ui/utils/instructions/disputeSafe/client.ts`
   — Thin wrapper around Anchor Program (or SDK) with typed instruction builders

3. Six form components under
   `governance-ui/pages/dao/[symbol]/proposal/components/instructions/DisputeSafe/`
   - `MigrateToSafe.tsx`
   - `QueuePayout.tsx`
   - `ChallengePayout.tsx`
   - `RecordRuling.tsx`
   - `ReleasePayout.tsx`
   - `ExitFromCustody.tsx`

4. Register the 6 components in `new.tsx` (replacing the null stubs)

5. Optional: instruction display decoder at
   `governance-ui/components/instructions/programs/safeTreasury.tsx`
   (for rendering queued instructions in proposal detail view)

Items 4–7 (payload hash spec, payout_id computation, eligibility mint, devnet fixtures)
unblock the more complex forms (QueuePayout, ChallengePayout) but do not block the simpler
ones (ReleasePayout, ExitFromCustody) which can start once item 1–3 land.