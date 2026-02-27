import { PublicKey } from '@solana/web3.js';

export enum CaseStatus {
  DOCKETED = 'docketed',
  IN_PROGRESS = 'in_progress',
  CONCLUDED = 'concluded',
}

export interface Case {
  caseId: string;
  disputeId: string;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;
  round: number;
}

export interface CaseState {
  caseId: string;
  disputeId: string;
  status: CaseStatus;
  createdAt: number;
  updatedAt: number;
  round: number;
  evidenceHashes: string[];
}

export interface CaseIntakeInput {
  disputeId: string;
  challenger: PublicKey;
  challenged: PublicKey;
  evidenceRefs: string[];
}
