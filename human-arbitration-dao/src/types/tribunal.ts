import { PublicKey } from '@solana/web3.js';

export enum TribunalPolicy {
  SOLE_ARBITRATOR = 'sole_arbitrator',
  THREE_MEMBER = 'three_member',
}

export enum TribunalStatus {
  PENDING = 'pending',
  CONFIGURED = 'configured',
  CONFLICT_DISCLOSED = 'conflict_disclosed',
  ACTIVE = 'active',
  CONCLUDED = 'concluded',
}

export enum ConflictStatus {
  DISCLOSED = 'disclosed',
  RECUSED = 'recused',
  RESOLVED = 'resolved',
}

export interface Conflict {
  arbitrator: PublicKey;
  caseId: string;
  status: ConflictStatus;
  disclosedAt: number;
  resolvedAt?: number;
  replacement?: PublicKey;
}

export interface TribunalAssignment {
  caseId: string;
  arbitrators: PublicKey[];
  policy: TribunalPolicy;
  status: TribunalStatus;
  assignedAt: number;
}

export interface TribunalState {
  caseId: string;
  policy: TribunalPolicy;
  arbitrators: PublicKey[];
  status: TribunalStatus;
  assignedAt: number;
  confirmedAt?: number;
  conflicts: Conflict[];
}
