# Safe-Treasury Test Coverage

## Overview

This document maps test coverage to PRD requirements and spec invariants. The test suite uses both **solana-program-test** (for existing integration tests) and **LiteSVM** (for new fast, deterministic tests).

## Test Infrastructure

### LiteSVM Tests (New)
- **Location**: `tests/litesvm_integration.rs`, `tests/litesvm_appeals.rs`
- **Benefits**: 
  - 10-100x faster than program-test
  - Deterministic execution
  - No network overhead
  - Better for CI/CD pipelines
- **Coverage**: Core flows, policy management, dispute lifecycle, appeals

### Program-Test Integration Tests (Existing)
- **Location**: `tests/admin.rs`, `tests/policy.rs`, `tests/challenge.rs`, `tests/ruling.rs`, `tests/appeals.rs`, `tests/finalize.rs`
- **Benefits**: Full runtime simulation
- **Coverage**: Complex multi-step flows, edge cases

## PRD Requirements Coverage

### Policy Management (SI-001, SI-002, SI-003)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-001: Policy init stores all fields | `test_policy_init_with_valid_floors` | litesvm_integration.rs | LiteSVM |
| SI-001: Policy init stores all fields | `si_001_policy_stores_all_fields` | policy.rs | Program-Test |
| SI-001: Dispute window floor (≥3600) | `test_policy_init_rejects_low_dispute_window` | litesvm_integration.rs | LiteSVM |
| SI-001: Dispute window floor (≥3600) | `si_001_dispute_window_below_floor_rejected` | policy.rs | Program-Test |
| SI-001: Challenge bond floor (≥10M) | `test_policy_init_rejects_low_challenge_bond` | litesvm_integration.rs | LiteSVM |
| SI-001: Challenge bond floor (≥10M) | `si_001_challenge_bond_below_floor_rejected` | policy.rs | Program-Test |
| SI-002: Unauthorized update rejected | `si_002_update_policy_unauthorized_signer_rejected` | policy.rs | Program-Test |
| SI-002: Authorized update accepted | `si_002_update_policy_authorized_signer_accepted` | policy.rs | Program-Test |
| SI-003: Policy snapshot immutable | `test_policy_snapshot_immutable_after_queue` | litesvm_integration.rs | LiteSVM |
| SI-003: Policy snapshot immutable | `si_003_payout_captures_policy_snapshot_at_queue_time` | policy.rs | Program-Test |

### Payout Queue & Release (SI-010, SI-011)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-010: Release blocked before dispute window | `si_010_release_before_dispute_window_rejected` | challenge.rs | Program-Test |
| SI-011: Release allowed after dispute window | `si_011_release_after_dispute_window_succeeds` | challenge.rs | Program-Test |

### Challenge Eligibility & State (SI-012, SI-013, SI-014, SI-015, SI-016, SI-036)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-012: Insufficient token balance rejected | `si_012_challenge_rejected_insufficient_token_balance` | challenge.rs | Program-Test |
| SI-013: Wrong bond amount rejected | `si_013_challenge_rejected_wrong_bond_amount` | challenge.rs | Program-Test |
| SI-013/014/015: Valid challenge accepted | `si_013_015_014_valid_challenge_accepted_and_state_persisted` | challenge.rs | Program-Test |
| SI-014: Bond vault updated | ✓ (covered in SI-013/014/015 test) | challenge.rs | Program-Test |
| SI-015: Status transitions to Challenged | ✓ (covered in SI-013/014/015 test) | challenge.rs | Program-Test |
| SI-016: Challenged payout blocked until ruling | `si_016_challenged_payout_blocked_until_ruling` | challenge.rs | Program-Test |
| SI-036: Only one active challenge per payout | `si_036_second_challenge_rejected_while_first_active` | challenge.rs | Program-Test |

### Resolver Authorization & Rulings (SI-017, SI-018, SI-019, SI-020, SI-029, SI-050)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-017: Wrong resolver rejected | `si_017_ruling_from_wrong_resolver_rejected` | ruling.rs | Program-Test |
| SI-017: Authorized resolver succeeds | `si_017_authorized_resolver_succeeds` | ruling.rs | Program-Test |
| SI-018: Wrong round rejected | `si_018_ruling_wrong_round_rejected` | ruling.rs | Program-Test |
| SI-019: Allow outcome makes payout releasable | `test_full_dispute_flow_allow_outcome` | litesvm_integration.rs | LiteSVM |
| SI-019: Allow outcome makes payout releasable | `si_019_allow_outcome_makes_payout_releasable` | ruling.rs | Program-Test |
| SI-020: Deny outcome blocks release | `test_full_dispute_flow_deny_outcome` | litesvm_integration.rs | LiteSVM |
| SI-020: Deny outcome blocks release | `si_020_deny_outcome_permanently_blocks_release` | ruling.rs | Program-Test |
| SI-029/050: Duplicate ruling rejected | `si_050_duplicate_ruling_same_round_rejected` | ruling.rs | Program-Test |

### Appeals (SI-021, SI-022, SI-033, SI-034)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-021: Third appeal rejected at cap | `test_appeal_cap_enforcement` | litesvm_appeals.rs | LiteSVM |
| SI-021: Third appeal rejected at cap | `si_021_third_appeal_rejected_at_cap` | appeals.rs | Program-Test |
| SI-022: Finalized payout cannot be appealed | `test_finalized_payout_cannot_be_appealed` | litesvm_appeals.rs | LiteSVM |
| SI-022: Finalized payout cannot be appealed | `si_022_finalized_payout_cannot_be_appealed` | appeals.rs | Program-Test |
| SI-033: Deny returns bond to challenger | `test_full_dispute_flow_deny_outcome` | litesvm_integration.rs | LiteSVM |
| SI-033: Deny returns bond to challenger | `si_033_deny_outcome_returns_bond_to_challenger` | appeals.rs | Program-Test |
| SI-033: Allow forfeits bond to vault | `si_033_allow_outcome_forfeits_bond_to_vault` | appeals.rs | Program-Test |
| SI-034: First appeal bond is 2× | `test_appeal_bond_escalation_2x_then_4x` | litesvm_appeals.rs | LiteSVM |
| SI-034: First appeal bond is 2× | `si_034_first_appeal_bond_is_2x` | appeals.rs | Program-Test |
| SI-034: Second appeal bond is 4× | `test_appeal_bond_escalation_2x_then_4x` | litesvm_appeals.rs | LiteSVM |
| SI-034: Second appeal bond is 4× | `si_034_second_appeal_bond_is_4x` | appeals.rs | Program-Test |

### Finalization (SI-045)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-045: Finalize before appeal window rejected | `si_045_finalize_before_appeal_window_rejected` | finalize.rs | Program-Test |
| SI-045: Finalize after appeal window succeeds | `si_045_finalize_after_appeal_window_succeeds_permissionlessly` | finalize.rs | Program-Test |
| SI-045: Finalize at round cap succeeds | `si_045_finalize_at_round_cap_succeeds` | finalize.rs | Program-Test |
| SI-045: Finalized outcome immutable | `si_045_finalized_outcome_is_immutable` | finalize.rs | Program-Test |

### Admin & Treasury Mode (SI-040, SI-041, SI-046, SI-047, SI-048)

| Requirement | Test | File | Type |
|-------------|------|------|------|
| SI-040: Treasury mode blocks vault funding | `si_040_treasury_mode_blocks_fund_native_vault` | admin.rs | Program-Test |
| SI-041: Without treasury mode, funding allowed | `si_041_without_treasury_mode_vault_funding_allowed` | admin.rs | Program-Test |
| SI-046: Cancel requires admin | `si_046_cancel_payout_non_admin_rejected` | admin.rs | Program-Test |
| SI-046: Cancel when policy disallows rejected | `si_046_cancel_payout_when_policy_disallows_rejected` | admin.rs | Program-Test |
| SI-046: Admin can cancel when allowed | `si_046_admin_can_cancel_queued_payout_when_policy_allows` | admin.rs | Program-Test |
| SI-046: Cannot cancel released payout | `si_046_cannot_cancel_already_released_payout` | admin.rs | Program-Test |
| SI-047: Exit custody blocked when flag disabled | `si_047_exit_custody_blocked_when_flag_disabled` | admin.rs | Program-Test |
| SI-048: Init native vault requires admin | `si_048_init_native_vault_requires_admin_signer` | admin.rs | Program-Test |
| SI-048: Init and fund vault with admin succeeds | `si_048_init_and_fund_native_vault_with_admin_succeeds` | admin.rs | Program-Test |
| SI-048: Fund vault non-admin rejected | `si_048_fund_native_vault_non_admin_rejected` | admin.rs | Program-Test |

## End-to-End Flow Coverage

### Complete Dispute Flows

1. **Allow Flow**: Queue → Challenge → Ruling(Allow) → Release
   - LiteSVM: `test_full_dispute_flow_allow_outcome`
   - Program-Test: Multiple tests across files

2. **Deny Flow**: Queue → Challenge → Ruling(Deny) → Verify Blocked
   - LiteSVM: `test_full_dispute_flow_deny_outcome`
   - Program-Test: Multiple tests across files

3. **Appeal Flow**: Queue → Challenge → Ruling(non-final) → Appeal → Ruling → Finalize
   - LiteSVM: `test_appeal_bond_escalation_2x_then_4x`, `test_appeal_cap_enforcement`
   - Program-Test: Tests in appeals.rs and finalize.rs

## Removed Tests

### Deleted: `si_048_native_vault_lifecycle.rs`
**Reason**: Low-value unit tests that only tested struct field assignments without actual on-chain behavior.

**What was removed**:
- `test_si_048_init_native_vault_requires_admin` - Just checked struct fields
- `test_si_048_fund_native_vault_requires_admin` - Just checked struct fields
- `test_si_048_native_vault_pda_derivation` - Trivial PDA derivation test
- `test_si_048_init_vault_accepts_admin` - Duplicate of field check
- `test_si_048_fund_vault_accepts_admin` - Duplicate of field check
- `test_si_048_release_obeys_dispute_gating` - Just checked struct fields
- `test_si_048_release_allowed_after_deadline` - Just checked struct fields
- `test_si_048_treasury_mode_blocks_fund_vault` - Just checked boolean field
- `test_si_048_error_code_for_unauthorized` - Trivial error enum match

**Better coverage**: All SI-048 requirements are properly covered by integration tests in `admin.rs` that actually execute transactions and verify on-chain behavior.

## Test Execution

### Run all tests
```bash
cargo test-sbf
```

### Run only LiteSVM tests (fast)
```bash
cargo test --test litesvm_integration
cargo test --test litesvm_appeals
```

### Run specific test file
```bash
cargo test-sbf --test policy
cargo test-sbf --test challenge
```

## Coverage Gaps & Future Work

### Covered ✓
- Policy lifecycle (init, update, floors, snapshot)
- Payout queue/release with dispute window
- Challenge eligibility and bond accounting
- Resolver authorization
- Ruling outcomes (Allow/Deny)
- Appeal bond escalation and cap
- Finalization conditions
- Treasury mode enforcement
- Admin authorization

### Additional Tests Recommended
1. **SPL Token Payouts**: Test SPL and Token-2022 payout flows (not just native SOL)
2. **Governance Proof Mode**: Test executed-proposal proof validation (authorization_mode=1)
3. **Event Emission**: Verify all events are emitted with correct data
4. **Concurrent Operations**: Test multiple payouts in parallel
5. **Clock Manipulation**: More edge cases around time boundaries
6. **Account Rent**: Verify rent-exempt requirements
7. **Realms Integration**: End-to-end tests with actual spl-governance integration

### Pending SI TDD Scaffolds (Ignored by default)
- `tests/tdd_missing_features.rs` contains explicit Red-phase tests for:
  - SI-023: Permissionless queue execution
  - SI-030: Proposal-backed ruling validation
  - SI-037: Token-2022 hook-aware release and atomic failure
  - SI-043: Proposal-proof queue authorization checks
  - SI-049: Required denied lifecycle event emission
- These tests are intentionally `#[ignore]` until implementation work starts.

## Summary

**Total Test Files**: 9 (6 program-test + 2 LiteSVM + 1 pending-TDD scaffold)
**Total Tests**: ~50+ integration tests
**PRD Coverage**: Implemented SIs are covered; pending SIs (SI-023, SI-030, SI-037, SI-043, SI-049) are tracked by ignored TDD scaffolds
**Test Types**: 
- Unit: 0 (removed low-value tests)
- Integration: ~40 (program-test)
- E2E: ~10 (LiteSVM)

For active implementation, unignore one pending SI test at a time and run strict Red-Green-Refactor.

The test suite now focuses on **high-value integration tests** that verify actual on-chain behavior rather than trivial struct field checks. LiteSVM tests provide fast feedback for core flows, while program-test integration tests provide comprehensive coverage of edge cases and complex scenarios.
