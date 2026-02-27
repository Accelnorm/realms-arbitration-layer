import { PublicKey } from '@solana/web3.js';

export interface EvidenceAnchor {
  caseId: string;
  evidenceHash: string;
  uri: string;
  submitter: PublicKey;
  timestamp: number;
}

export interface EvidenceRef {
  uri: string;
  hash: string;
}

export interface EvidenceState {
  caseId: string;
  anchors: EvidenceAnchor[];
}

export enum EvidenceError {
  ALREADY_ANCHORED = 'Evidence already anchored for this case',
  NOT_FOUND = 'Evidence not found',
  INVALID_HASH = 'Evidence hash mismatch',
  CASE_NOT_FOUND = 'Case not found',
}
