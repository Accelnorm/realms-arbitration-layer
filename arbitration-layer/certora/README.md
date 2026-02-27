# Certora Setup (Safe Treasury)

This directory follows the same layout used in Certora Solana examples:

- `certora/conf/*.conf` - Prover run configs (JSON5)
- `certora/summaries/*.txt` - inlining/summaries input files
- `certora/checks.rs` - CVLR rule file
- `certora/scripts/run-certora.sh` - local runner
- `certora/justfile` - convenience targets

## Prerequisites

- `certoraSolanaProver` in PATH
- Certora credentials configured (for cloud runs)
- Rust toolchain compatible with this workspace

## Run

From this directory:

```bash
./scripts/run-certora.sh conf/Smoke.conf
```

Or with `just`:

```bash
just smoke
just core
just all
```

## What `checks.rs` Verifies

`checks.rs` contains CVLR rules that prove core state invariants and helper determinism, independent of full account-context instruction proofs.

### Enum discriminant round‑trip invariants
- `rule_payout_status_roundtrip` — PayoutStatus enum values serialize and deserialize correctly (no data corruption)
- `rule_asset_type_roundtrip` — AssetType enum values serialize and deserialize correctly (no data corruption)
- `rule_ruling_outcome_roundtrip` — RulingOutcome enum values serialize and deserialize correctly (no data corruption)
- `rule_treasury_mode_roundtrip` — TreasuryMode enum values serialize and deserialize correctly (no data corruption)

### Treasury mode helper exactness
- `rule_treasury_info_helpers_follow_mode_discriminant` — TreasuryInfo helpers correctly identify enforced vs legacy modes

### Hash helper determinism (proposal‑proof mode)
- `rule_compute_payout_id_is_deterministic` — Payout IDs are always the same for identical inputs (no randomness)
- `rule_compute_queue_payload_hash_is_deterministic` — Queue payload hashes are always the same for identical inputs (no randomness)
- `rule_compute_ruling_payload_hash_is_deterministic` — Ruling payload hashes are always the same for identical inputs (no randomness)

### Payout releasability semantics
- `rule_payout_releasable_without_challenge_after_deadline` — Unchallenged payouts become releasable after the dispute deadline
- `rule_payout_not_releasable_without_challenge_before_deadline` — Unchallenged payouts are blocked before the dispute deadline
- `rule_payout_releasable_when_finalized_allow` — Payouts with a final "Allow" ruling are immediately releasable
- `rule_payout_not_releasable_when_challenged_not_finalized` — Challenged payouts stay blocked until a final ruling
- `rule_payout_not_releasable_when_finalized_deny` — Payouts with a final "Deny" ruling can never be released

## Notes

- Source-mode metadata is configured in:
  - `programs/safe-treasury/Cargo.toml` (`[package.metadata.certora]`)
- `solana_inlining` and `solana_summaries` are currently minimal bootstrap files.
  Add project-specific summaries as verification coverage grows.
