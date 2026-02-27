import { PublicKey } from '@solana/web3.js';

export interface Arbitrator {
  pubkey: PublicKey;
  name: string;
  credentials: string;
  registeredAt: number;
  status: ArbitratorStatus;
}

export enum ArbitratorStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REMOVED = 'removed',
}

export interface RosterEntry {
  arbitrator: PublicKey;
  name: string;
  version: number;
  addedAt: number;
  removedAt?: number;
}

export interface RosterState {
  entries: RosterEntry[];
  version: number;
  updatedAt: number;
}

export interface RosterAuditRecord {
  action: RosterAction;
  arbitrator: PublicKey;
  version: number;
  timestamp: number;
  previousVersion?: number;
}

export enum RosterAction {
  ADD = 'add',
  REMOVE = 'remove',
  SUSPEND = 'suspend',
}

export interface RosterConfigType {
  admin: PublicKey;
}
