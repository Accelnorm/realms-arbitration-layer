import { PublicKey } from '@solana/web3.js';
import {
  RosterState,
  RosterEntry,
  RosterAuditRecord,
  RosterAction,
} from '../types/roster';
import { RoleModel } from './roleModel';

export interface RosterConfig {
  admin: PublicKey;
}

export class ArbitratorRoster {
  private state: RosterState;
  private auditRecords: RosterAuditRecord[];
  private roleModel: RoleModel;

  constructor(roleModel: RoleModel) {
    this.roleModel = roleModel;
    this.state = {
      entries: [],
      version: 1,
      updatedAt: Date.now(),
    };
    this.auditRecords = [];
  }

  async addArbitrator(
    admin: PublicKey,
    arbitratorPubkey: PublicKey,
    name: string,
    credentials: string
  ): Promise<RosterState> {
    this.roleModel.checkAuthorization(admin, 'roster.add');

    const existingEntry = this.state.entries.find(
      e => e.arbitrator.equals(arbitratorPubkey) && !e.removedAt
    );
    if (existingEntry) {
      throw new Error('Arbitrator already exists in roster');
    }

    const entry: RosterEntry = {
      arbitrator: arbitratorPubkey,
      name,
      version: this.state.version,
      addedAt: Date.now(),
    };

    this.state.entries.push(entry);
    this.state.version++;
    this.state.updatedAt = Date.now();

    this.auditRecords.push({
      action: RosterAction.ADD,
      arbitrator: arbitratorPubkey,
      version: this.state.version,
      timestamp: Date.now(),
    });

    return this.state;
  }

  async removeArbitrator(
    admin: PublicKey,
    arbitratorPubkey: PublicKey
  ): Promise<RosterState> {
    this.roleModel.checkAuthorization(admin, 'roster.remove');

    const entry = this.state.entries.find(
      e => e.arbitrator.equals(arbitratorPubkey) && !e.removedAt
    );
    if (!entry) {
      throw new Error('Arbitrator not found in roster');
    }

    const previousVersion = entry.version;
    entry.removedAt = Date.now();
    this.state.version++;
    this.state.updatedAt = Date.now();

    this.auditRecords.push({
      action: RosterAction.REMOVE,
      arbitrator: arbitratorPubkey,
      version: this.state.version,
      timestamp: Date.now(),
      previousVersion,
    });

    return this.state;
  }

  getActiveArbitrators(): RosterEntry[] {
    return this.state.entries.filter(e => !e.removedAt);
  }

  getArbitrator(pubkey: PublicKey): RosterEntry | undefined {
    return this.state.entries.find(
      e => e.arbitrator.equals(pubkey) && !e.removedAt
    );
  }

  getState(): RosterState {
    return this.state;
  }

  getAuditRecords(): RosterAuditRecord[] {
    return this.auditRecords;
  }
}
