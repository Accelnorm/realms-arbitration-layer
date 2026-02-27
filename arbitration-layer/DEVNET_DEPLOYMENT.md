# Devnet Deployment Status

## Successfully Deployed Programs

### Safe-Treasury Program
- **Program ID**: `9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD`
- **Network**: Devnet
- **Deployment Date**: Feb 27, 2026
- **Verification**: 
  ```bash
  solana program show 9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD --url devnet
  ```

### Governance Program (Local Build)
- **Program ID**: `EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff`
- **Network**: Devnet
- **Version**: 3.1.0 (local governance build)
- **Deployment Date**: Feb 27, 2026
- **Verification**:
  ```bash
  solana program show EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff --url devnet
  ```

## Build Artifacts

### Safe-Treasury
- **Source**: `/home/user/solana/realms-arbitration-layer/arbitration-layer/programs/safe-treasury`
- **Binary**: `target/sbpf-solana-solana/release/safe_treasury.so`
- **Keypair**: `target/deploy/safe_treasury-keypair.json`
- **Build Command**: `cargo build-sbf --no-default-features`

### Governance
- **Source**: `/home/user/solana/realms-arbitration-layer/governance/program`
- **Binary**: `target/sbpf-solana-solana/release/spl_governance.so`
- **Keypair**: `target/deploy/spl_governance-keypair.json`
- **Build Command**: `cargo build-sbf`

## Local Testing Options

### Option 1: Direct Devnet Testing (Recommended)
Test directly against devnet where both programs are deployed:

```bash
# Set RPC URL to devnet
export SOLANA_RPC_URL=https://api.devnet.solana.com
export GOVERNANCE_PROGRAM_ID=EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff

# Run bootstrap scripts
cd /home/user/solana/realms-arbitration-layer/arbitration-layer
bash scripts/localnet/bootstrap-three-daos.sh
```

**Note**: This will create real accounts on devnet and consume devnet SOL.

### Option 2: Local Test Validator (Needs Investigation)
The local test-validator approach encountered issues with the governance program:
- Local build has access violations
- Devnet clone feature not working as expected

**Known Issues**:
- Locally built governance program fails with "Access violation in unknown section"
- `solana-test-validator --clone` from devnet not successfully loading the program
- Surfpool devnet fork mode not pulling accounts despite configuration

## Next Steps for Local Testing

1. **Investigate Governance Program Build**:
   - The local governance build may need different compilation flags
   - Consider using pre-built governance program from Solana Program Library
   - Alternative: Use mainnet governance program ID (GovER5...) with test-validator clone from mainnet

2. **Alternative Approach - Use Mainnet Governance**:
   ```bash
   # Clone mainnet governance program (GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw)
   solana-test-validator \
     --bpf-program 9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD \
       programs/safe-treasury/target/deploy/safe_treasury.so \
     --clone GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw \
     --url mainnet \
     --reset
   ```

3. **For UI Development**:
   - Use devnet directly for initial integration testing
   - Bootstrap scripts need to be run with `GOVERNANCE_PROGRAM_ID=EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff`
   - Fixture generation scripts will output to `localnet/` directory

## Configuration Files

### Anchor.toml (Created for Deployment)
Located at: `/home/user/solana/realms-arbitration-layer/arbitration-layer/Anchor.toml`

```toml
[programs.devnet]
safe_treasury = "9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"
```

### Surfpool.toml (Attempted Configuration)
Located at: `/home/user/solana/realms-arbitration-layer/arbitration-layer/localnet/Surfpool.toml`

**Status**: Surfpool devnet fork mode did not successfully pull programs. Needs further investigation or alternative approach.

## Deployment Commands Reference

### Redeploy Safe-Treasury to Devnet
```bash
cd /home/user/solana/realms-arbitration-layer/arbitration-layer/programs/safe-treasury
cargo build-sbf --no-default-features
solana program deploy \
  target/sbpf-solana-solana/release/safe_treasury.so \
  --program-id target/deploy/safe_treasury-keypair.json \
  --url devnet
```

### Redeploy Governance to Devnet
```bash
cd /home/user/solana/realms-arbitration-layer/governance/program
cargo build-sbf
solana program deploy \
  target/sbpf-solana-solana/release/spl_governance.so \
  --program-id target/deploy/spl_governance-keypair.json \
  --url devnet
```

## Summary

✅ **Completed**:
- Safe-treasury successfully deployed to devnet
- Local governance program successfully deployed to devnet
- Both programs verified accessible on devnet
- Build scripts updated and working
- Anchor workspace created for devnet deployment

❌ **Blocked**:
- Local test-validator setup with both programs
- Surfpool devnet fork configuration
- Full bootstrap script execution on local validator

**Recommendation**: Proceed with devnet testing directly while investigating local validator issues separately.

## UI Agent Handoff (Working Path)

The local handoff path is now working on Surfpool via fallback account seeding.

### Start local RPC

```bash
cd /home/user/solana/realms-arbitration-layer/arbitration-layer
bash scripts/localnet/start-surfpool.sh
```

### Bootstrap + fixture export

```bash
cd /home/user/solana/realms-arbitration-layer/arbitration-layer
GOVERNANCE_PROGRAM_ID=EvZSBRp7pJkRUqTtNU41C2gmBK9Cz35gh2oy42GKL7Ff bash scripts/localnet/bootstrap-three-daos.sh
bash scripts/localnet/seed-ui-fixtures.sh
bash scripts/localnet/bootstrap-safe-treasury-primitives.sh
bash scripts/localnet/export-ui-agent-input.sh
```

### Output files for UI agent

- `localnet/dao-state.json`
- `localnet/safe-policy-state.json`
- `localnet/payout-fixtures.json`
- `localnet/ui-agent-context.json`

### Notes

- `bootstrap-three-daos.sh` now falls back to deterministic PDA account seeding when governance CPI execution is unavailable.
- `bootstrap-safe-treasury-primitives.sh` now falls back to deterministic vault account seeding when safe-treasury instruction execution is unavailable.
- This unblocks UI integration by providing stable local addresses and fixture payloads.
