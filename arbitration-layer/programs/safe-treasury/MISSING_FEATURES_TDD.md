# Safe-Treasury Missing Features TDD Plan

This document defines implementation structure and TDD best practices for features that are currently marked `passes: false` in `arbitration-layer/specs/prd/prd.json`.

## Current missing structured items

- SI-023: Permissionless queue execution
- SI-030: Proposal-backed ruling outcome validation
- SI-037: Token-2022 transfer-hook aware payout flow
- SI-043: Proposal-proof queue authorization (permissionless executor)
- SI-049: Required lifecycle events (`PayoutDenied` gaps)

## TDD workflow (required)

Use strict Red-Green-Refactor per SI:

1. **Red**
   - Unignore the SI test(s) in `tests/tdd_missing_features.rs`.
   - Assert intended behavior from spec; test must fail for the right reason.
2. **Green**
   - Implement smallest possible code change to satisfy the failing test.
   - Avoid broad refactors during Green phase.
3. **Refactor**
   - Improve naming/duplication/guard rails after behavior is green.
   - Keep all newly added tests green.
4. **Close-out**
   - Flip SI `passes` flag to true in PRD only after tests pass.
   - Add/adjust coverage mapping in `tests/TEST_COVERAGE.md`.

## File-level implementation map

### SI-023 + SI-043 (permissionless queue + proposal-proof)

- Primary code: `src/instructions/payout.rs`
- TODO anchor: `TODO(SI-023/SI-043,TDD)`

Best-practice implementation notes:
- Separate **executor identity** from **authority identity**.
- Verify governance proof binds to payload hash and safe policy context.
- Ensure replay safety and deterministic validation path.
- Keep signer mode (`authorization_mode=0`) unchanged.

### SI-030 (proposal outcome validation)

- Primary code: `src/instructions/challenge.rs` (`record_ruling`)
- TODO anchor: `TODO(SI-030,TDD)`

Best-practice implementation notes:
- Validate proposal state is finalized/passed, not just account linkage.
- Bind proposal metadata to dispute id + round + payload hash.
- Reject stale or mismatched governance artifacts.

### SI-037 (Token-2022)

- Primary code: `src/instructions/payout.rs`
- TODO anchor: `TODO(SI-037,TDD)`

Best-practice implementation notes:
- Add explicit Token-2022 execution path (do not overload SPL classic path).
- Ensure hook rejection preserves atomicity and leaves balances unchanged.
- Keep token-program checks explicit to prevent mixed-program confusion.

### SI-049 (required lifecycle events)

- Primary code: `src/instructions/challenge.rs`
- TODO anchors:
  - `TODO(SI-049,TDD): emit PayoutDenied for final deny outcomes.`
  - `TODO(SI-049,TDD): emit PayoutDenied for finalize-path deny outcomes.`

Best-practice implementation notes:
- Emit `PayoutDenied` exactly on deny terminal transitions.
- Keep event fields deterministic and stable for automation consumers.
- Add both positive and negative event assertions.

## Recommended implementation order

1. SI-043 + SI-023 (shared queue auth path)
2. SI-030 (ruling proposal validity)
3. SI-049 (event completeness)
4. SI-037 (largest surface area; Token-2022)

## Done criteria for each SI

- SI tests in `tests/tdd_missing_features.rs` unignored and passing
- No regressions in existing tests
- PRD `passes` updated to true for completed SI
- Coverage docs updated
