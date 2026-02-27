# IMPORTANT: Governance CreateRealm ABI Mismatch Fix

**Date:** 2026-02-27  
**Status:** FIXED  
**Impact:** Critical for localnet bootstrap and UI testing

## Problem

When running local test-validator with locally-built governance program, `bootstrap-three-daos.sh` failed with:

```
Program failed to complete
Access violation in unknown section at address 0x2 of size 68
```

This occurred during `CreateRealm` when the program tried to CPI into `spl_token` to create token holding accounts.

## Root Cause

**ABI mismatch between build toolchain and runtime:**

- Governance source: `solana-program = 1.14.6` (edition 2018)
- Build toolchain: `cargo build-sbf` from Agave 2.2.12
  - platform-tools v1.47
  - rustc 1.84.1 (edition 2021)

The modern BPF compiler generates bytecode incompatible with the old SDK's CPI expectations, causing runtime access violations during cross-program calls.

## Solution

**Use the mainnet-deployed governance binary instead of locally building:**

1. **Dump mainnet binary:**
   ```bash
   solana program dump --url mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
     arbitration-layer/localnet/spl_governance_mainnet.so
   ```

2. **Update validator scripts to use mainnet binary:**
   - `arbitration-layer/scripts/localnet/start-local-validator.sh`
   - `arbitration-layer/scripts/localnet/start-test-validator.sh`
   - Changed from `EvZS...` to `GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw`
   - Binary path: `$ARB_ROOT/localnet/spl_governance_mainnet.so`

3. **Added opt-in bypass flag:**
   - `SKIP_GOVERNANCE_INSTRUCTIONS=1` in `bootstrap-three-daos.sh`
   - Allows skipping broken governance CPI when needed

## Files Changed

- `arbitration-layer/localnet/spl_governance_mainnet.so` (new)
- `arbitration-layer/scripts/localnet/start-local-validator.sh` (updated)
- `arbitration-layer/scripts/localnet/start-test-validator.sh` (updated)
- `arbitration-layer/scripts/localnet/bootstrap-three-daos.sh` (added bypass flag)
- `governance-ui/specs/ui-testing.json` (UT-003 marked validated)

## Verification

```bash
# Start validator with mainnet governance
bash arbitration-layer/scripts/localnet/start-local-validator.sh

# Bootstrap creates real on-chain accounts (no fallback)
bash arbitration-layer/scripts/localnet/bootstrap-three-daos.sh

# Verify realm exists
curl -s -X POST http://127.0.0.1:8899 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["EPfaFw1wXRv1vVB4BqvPAAxHoBpetiJHAA2JTx6J7J7m",{"encoding":"base64","commitment":"confirmed"}]}' \
  | jq '.result.value.owner'
# Expected: "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
```

## Impact

- ✅ Localnet bootstrap now creates **real on-chain realm + governance accounts**
- ✅ UI testing can proceed with actual governance state
- ✅ No more fallback seeding required
- ✅ UT-003 in `ui-testing.json` validated

## Notes

- The mainnet binary is compatible with Agave 2.2.12 runtime
- Local governance source build still works for other purposes but should not be used for localnet bootstrap
- Safe-treasury program builds fine with modern toolchain (no ABI issues)
- This fix is specific to the old SPL governance program (v3.1.0, solana-program 1.14.6)

## Recovery

If the mainnet binary is missing:

```bash
# Re-dump from mainnet
solana program dump --url mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
  arbitration-layer/localnet/spl_governance_mainnet.so
```

---

**This fix enables full end-to-end localnet testing for the DisputeSafe UI integration.**
