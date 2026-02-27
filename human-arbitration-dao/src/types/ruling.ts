import { PublicKey } from '@solana/web3.js';
import { CaseStatus } from './case';
import { TribunalPolicy } from './tribunal';

export enum RulingOutcome {
  GRANTED = 'granted',
  DENIED = 'denied',
  DISMISSED = 'dismissed',
  REMANDED = 'remanded',
}

export enum DecisionPolicy {
  MAJORITY = 'majority',
  UNANIMOUS = 'unanimous',
  SOLE = 'sole',
}

export interface RulingVote {
  arbitrator: PublicKey;
  outcome: RulingOutcome;
  rationale: string;
  votedAt: number;
}

export interface RulingPayloadInput {
  caseId: string;
  disputeId: string;
  round: number;
  tribunalPolicy: TribunalPolicy;
  votes: RulingVote[];
  evidenceHashes: string[];
}

export interface RulingPayload {
  caseId: string;
  disputeId: string;
  round: number;
  tribunalPolicy: TribunalPolicy;
  outcome: RulingOutcome;
  decisionPolicy: DecisionPolicy;
  voteCount: Record<RulingOutcome, number>;
  evidenceHashes: string[];
  compiledAt: number;
  payloadHash: string;
}

export interface RulingState {
  caseId: string;
  disputeId: string;
  round: number;
  outcome: RulingOutcome;
  decisionPolicy: DecisionPolicy;
  payloadHash: string;
  executedAt: number;
  proposalId?: string;
}
