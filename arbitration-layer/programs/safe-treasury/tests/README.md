# Safe-Treasury Test Suite

## Quick Start

```bash
# Run all tests
cargo test-sbf

# Run fast LiteSVM tests only
cargo test --test litesvm_integration
cargo test --test litesvm_appeals

# Run specific test file
cargo test-sbf --test policy

# Run pending TDD scaffolds (all ignored by default)
cargo test --test tdd_missing_features
```

## Test Organization

### LiteSVM Tests (Fast, Deterministic)
- `litesvm_integration.rs` - Core dispute flows, policy management
- `litesvm_appeals.rs` - Appeal flows, bond escalation, finalization

**Benefits**: 10-100x faster, deterministic, ideal for CI/CD

### Program-Test Integration Tests (Comprehensive)
- `policy.rs` - Policy lifecycle (SI-001, SI-002, SI-003)
- `challenge.rs` - Challenge eligibility and state (SI-010-SI-016, SI-036)
- `ruling.rs` - Resolver authorization and rulings (SI-017-SI-020, SI-029, SI-050)
- `appeals.rs` - Appeal flows and bond settlement (SI-021, SI-022, SI-033, SI-034)
- `finalize.rs` - Finalization conditions (SI-045)
- `admin.rs` - Admin operations and treasury mode (SI-040, SI-041, SI-046-SI-048)
- `tdd_missing_features.rs` - Ignored TDD-red scaffolds for currently missing SIs (SI-023, SI-030, SI-037, SI-043, SI-049)

**Benefits**: Full runtime simulation, comprehensive edge case coverage

## Test Coverage

See `TEST_COVERAGE.md` for detailed mapping of tests to PRD requirements.

**Summary**:
- ✅ Implemented SIs are covered by active tests
- ✅ Missing SIs have explicit ignored TDD scaffolds
- ✅ ~50+ integration tests
- ✅ End-to-end dispute flows (Allow, Deny, Appeal)
- ✅ Bond accounting verification
- ✅ State machine invariant checks
- ✅ Authorization and permission tests

## What Was Improved

### Added
1. **LiteSVM dependency** for fast, deterministic testing
2. **litesvm_integration.rs** - Core flows with full end-to-end coverage
3. **litesvm_appeals.rs** - Appeal and finalization flows
4. **TEST_COVERAGE.md** - Comprehensive coverage documentation
5. **tdd_missing_features.rs** - pending-red test scaffolds for missing features

### Removed
- **si_048_native_vault_lifecycle.rs** - Low-value unit tests that only checked struct fields without actual on-chain behavior

### Kept
- All existing integration tests in `admin.rs`, `policy.rs`, `challenge.rs`, `ruling.rs`, `appeals.rs`, `finalize.rs`
- These provide comprehensive coverage with actual transaction execution

## Test Philosophy

**Good Tests** (Kept/Added):
- Execute actual transactions through the program
- Verify on-chain state changes
- Test authorization and permission boundaries
- Cover end-to-end flows
- Validate PRD requirements and invariants

**Bad Tests** (Removed):
- Only check struct field assignments
- Trivial PDA derivation without context
- Simple boolean/enum checks without behavior
- Duplicate coverage without added value

## Development Workflow

1. **During development**: Run fast LiteSVM tests for quick feedback
   ```bash
   cargo test --test litesvm_integration --test litesvm_appeals
   ```

2. **Before commit**: Run full test suite
   ```bash
   cargo test-sbf
   ```

3. **CI/CD**: Run all tests with coverage reporting

## Adding New Tests

### For new features
1. Add LiteSVM test for core happy path
2. Add program-test integration tests for edge cases
3. Update TEST_COVERAGE.md with requirement mapping
4. If feature is intentionally pending, add an ignored scaffold test in `tdd_missing_features.rs` and a TODO anchor in implementation code

### Test naming convention
- LiteSVM: `test_<feature>_<scenario>`
- Program-test: `si_<number>_<requirement_description>`

## Common Test Patterns

### Setup fixture
```rust
let mut svm = setup_litesvm();
let authority = Keypair::new();
airdrop(&mut svm, &authority.pubkey(), 10_000_000_000);
```

### Execute transaction
```rust
let tx = Transaction::new_signed_with_payer(
    &[ix],
    Some(&authority.pubkey()),
    &[&authority],
    svm.latest_blockhash(),
);
svm.send_transaction(tx).unwrap();
```

### Verify state
```rust
let account = svm.get_account(&pda).unwrap();
let state = State::try_deserialize(&mut account.data.as_slice()).unwrap();
assert_eq!(state.field, expected_value);
```

## Troubleshooting

### LiteSVM tests fail but program-test passes
- Check for timing/clock dependencies
- Verify account initialization order
- Ensure all required accounts are set up

### All tests fail
- Run `cargo build-sbf` first
- Check program ID matches in lib.rs and tests
- Verify Anchor version compatibility

### `edition2024` parse error on `cargo test-sbf`
- This is usually a **local Cargo/Rust toolchain mismatch**, not a program logic failure.
- Use the pinned toolchain in this crate:
  ```bash
  rustup toolchain install 1.85.0
  rustup override set 1.85.0
  ```
- Keep dependency resolution deterministic:
  ```bash
  cargo test-sbf --locked
  ```

### Specific test flakes
- Add deterministic clock manipulation
- Check for race conditions in parallel tests
- Verify account state cleanup between tests
