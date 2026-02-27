# Human Arbitration DAO

TypeScript SDK and CLI for institutional arbitration on Solana Realms, enabling human arbitrators to resolve disputes in the Safe Treasury system.

## Overview

The Human Arbitration DAO provides governance infrastructure for managing human arbitrators who resolve challenged payouts in the Safe Treasury dispute resolution system. It implements role-based access control (RBAC) and integrates with Solana's SPL Governance program to coordinate institutional arbitration workflows.

## Features

- **Realms Integration**: Deploy and manage governance structures on Solana Realms
- **Role-Based Access Control**: Define and enforce permissions for Admin, Case Manager, Arbitrator, Executor, and Observer roles
- **CLI Tooling**: Command-line interface (`ralph`) for DAO deployment and role management
- **TypeScript SDK**: Programmatic access to governance and arbitration primitives

## Installation

```bash
npm install
npm run build
```

## CLI Usage

The `ralph` CLI provides commands for deploying and managing the Human Arbitration DAO.

### Bootstrap DAO

Deploy a new Human Arbitration DAO instance on Solana Realms:

```bash
ralph bootstrap --rpc <RPC_URL> --realm <REALM_NAME> --admin <ADMIN_PUBKEY>
```

**Options:**
- `--rpc <url>`: Solana RPC endpoint (default: mainnet-beta)
- `--realm <name>`: Name for the Realm (default: HumanArbitrationDAO)
- `--admin <key>`: Admin public key for initial governance authority

**Example:**
```bash
ralph bootstrap \
  --rpc https://api.devnet.solana.com \
  --realm "MyArbitrationDAO" \
  --admin FdrDZPcYEjdB3nQGUgL7muXj4SBTzbAMMvMosufdtun1
```

### Initialize Role Model

Set up role assignments for DAO participants:

```bash
ralph roles --admin <ADMIN_PUBKEY>
```

**Options:**
- `--admin <key>`: Admin public key (required)

## SDK Usage

### Bootstrap a DAO

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { RealmsBootstrap } from '@human-arbitration-dao/ralph';

const connection = new Connection('https://api.devnet.solana.com');
const bootstrap = new RealmsBootstrap(connection);

const config = {
  realmName: 'MyArbitrationDAO',
  resolverIdentity: new PublicKey('...'),
  admin: new PublicKey('...'),
  caseManager: new PublicKey('...'),
  executors: [new PublicKey('...')],
  observers: [new PublicKey('...')],
};

const manifest = await bootstrap.deploy(config);
console.log('DAO Address:', manifest.daoAddress.toBase58());
```

### Manage Roles

```typescript
import { RoleModel, Role } from '@human-arbitration-dao/ralph';

const roleModel = new RoleModel(adminPubkey);

const roleConfig = {
  admin: adminPubkey,
  caseManager: caseManagerPubkey,
  arbitrators: [arbitrator1, arbitrator2],
  executors: [executor1],
  observers: [observer1, observer2],
};

const state = await roleModel.initialize(roleConfig);

// Check permissions
const canResolve = roleModel.hasPermission(arbitratorPubkey, 'resolve_dispute');
```

## Role Hierarchy

| Role | Permissions |
|------|-------------|
| **Admin** | Full governance authority, role assignment, policy updates |
| **Case Manager** | Assign cases, manage arbitrator workload, view all disputes |
| **Arbitrator** | Resolve assigned disputes, record rulings, participate in appeals |
| **Executor** | Execute approved rulings, trigger on-chain state changes |
| **Observer** | Read-only access to dispute records and governance state |

## Architecture

```
human-arbitration-dao/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── index.ts            # SDK exports
│   ├── modules/
│   │   ├── bootstrap.ts    # Realms deployment
│   │   └── roleModel.ts    # RBAC implementation
│   ├── types/
│   │   ├── governance.ts   # Governance primitives
│   │   └── roles.ts        # Role definitions
│   └── tests/              # Unit and integration tests
├── scripts/                # Automation scripts
└── package.json
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
npm run test:watch
```

### Lint

```bash
npm run lint
npm run typecheck
```

## Integration with Safe Treasury

The Human Arbitration DAO integrates with the Safe Treasury program to resolve disputed payouts:

1. **Challenge Phase**: Payout is challenged via Safe Treasury `challenge_payout` instruction
2. **Assignment**: Case Manager assigns dispute to an Arbitrator
3. **Resolution**: Arbitrator reviews evidence and records ruling via `record_ruling`
4. **Execution**: Executor triggers on-chain state change based on ruling
5. **Appeal** (optional): Losing party may appeal, escalating to additional arbitrators

## License

Apache-2.0

## Related Components

- **Safe Treasury Program**: `/arbitration-layer/programs/safe-treasury`
- **AI Arbitration DAO**: `/ai-arbitration-dao`
- **Governance UI**: `/governance-ui` (DisputeSafe interface)
