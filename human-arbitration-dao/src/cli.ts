#!/usr/bin/env node
import { Connection, PublicKey } from '@solana/web3.js';
import { RealmsBootstrap } from './modules/bootstrap';
import { RoleModel, RoleModelConfig } from './modules/roleModel';

interface CliFlags {
  rpcUrl?: string;
  realmName?: string;
  admin?: string;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const flags: CliFlags = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--rpc' && args[i + 1]) {
      flags.rpcUrl = args[i + 1];
      i++;
    } else if (args[i] === '--realm' && args[i + 1]) {
      flags.realmName = args[i + 1];
      i++;
    } else if (args[i] === '--admin' && args[i + 1]) {
      flags.admin = args[i + 1];
      i++;
    }
  }

  const rpcUrl = flags.rpcUrl || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl);

  if (command === 'bootstrap') {
    const realmName = flags.realmName || 'HumanArbitrationDAO';
    const adminKey = flags.admin ? new PublicKey(flags.admin) : PublicKey.default;
    
    const bootstrap = new RealmsBootstrap(connection);
    const config = {
      realmName,
      resolverIdentity: adminKey,
      admin: adminKey,
      caseManager: adminKey,
      executors: [adminKey],
      observers: [adminKey],
    };
    
    const manifest = await bootstrap.deploy(config);
    console.log('DAO Deployed:', JSON.stringify(manifest, (key, value) => {
      if (value instanceof PublicKey) return value.toBase58();
      return value;
    }, 2));
  }

  if (command === 'roles') {
    if (!flags.admin) {
      console.error('Error: --admin required');
      process.exit(1);
    }
    
    const adminKey = new PublicKey(flags.admin);
    const roleModel = new RoleModel(adminKey);
    
    const config: RoleModelConfig = {
      admin: adminKey,
      caseManager: adminKey,
      arbitrators: [],
      executors: [],
      observers: [],
    };
    
    const state = await roleModel.initialize(config);
    console.log('Role Model Initialized:');
    for (const assignment of state.assignments) {
      console.log(`  ${assignment.pubkey}: ${assignment.role}`);
    }
  }

  if (!command) {
    console.log('Usage: ralph <command> [options]');
    console.log('Commands:');
    console.log('  bootstrap    Deploy Human Arbitration DAO');
    console.log('  roles       Initialize role model');
    console.log('Options:');
    console.log('  --rpc <url>    RPC URL (default: mainnet)');
    console.log('  --realm <name> Realm name');
    console.log('  --admin <key>  Admin public key');
  }
}

main().catch(console.error);
