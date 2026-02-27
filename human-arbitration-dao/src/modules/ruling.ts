import { createHash } from 'crypto';
import {
  RulingPayloadInput,
  RulingPayload,
  RulingOutcome,
  DecisionPolicy,
  RulingState,
} from '../types/ruling';
import { TribunalPolicy } from '../types/tribunal';

export class RulingCompiler {
  private rulings: Map<string, RulingState>;

  constructor() {
    this.rulings = new Map();
  }

  private computeDeterministicHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private sortVotes(votes: { arbitrator: string; outcome: string }[]): string {
    const sorted = [...votes].sort((a, b) => a.arbitrator.localeCompare(b.arbitrator));
    return JSON.stringify(sorted);
  }

  compilePayload(input: RulingPayloadInput): RulingPayload {
    if (!input.caseId || input.caseId.trim() === '') {
      throw new Error('Canonical binding required: caseId');
    }
    if (!input.disputeId || input.disputeId.trim() === '') {
      throw new Error('Canonical binding required: disputeId');
    }
    if (input.round === undefined || input.round < 0) {
      throw new Error('Canonical binding required: round');
    }
    if (!input.tribunalPolicy) {
      throw new Error('Canonical binding required: tribunalPolicy');
    }
    if (!input.votes || input.votes.length === 0) {
      throw new Error('Canonical binding required: votes');
    }

    const voteCount: Record<RulingOutcome, number> = {
      [RulingOutcome.GRANTED]: 0,
      [RulingOutcome.DENIED]: 0,
      [RulingOutcome.DISMISSED]: 0,
      [RulingOutcome.REMANDED]: 0,
    };

    for (const vote of input.votes) {
      voteCount[vote.outcome]++;
    }

    const outcome = this.determineOutcome(input.votes, input.tribunalPolicy);
    const decisionPolicy = this.determineDecisionPolicy(input.votes, input.tribunalPolicy);

    const canonicalData = {
      caseId: input.caseId,
      disputeId: input.disputeId,
      round: input.round,
      tribunalPolicy: input.tribunalPolicy,
      votes: input.votes.map(v => ({
        arbitrator: v.arbitrator.toBase58(),
        outcome: v.outcome,
      })),
      evidenceHashes: [...input.evidenceHashes].sort(),
    };

    const sortedData = JSON.stringify({
      ...canonicalData,
      votes: this.sortVotes(canonicalData.votes),
    });

    const payloadHash = this.computeDeterministicHash(sortedData);

    const payload: RulingPayload = {
      caseId: input.caseId,
      disputeId: input.disputeId,
      round: input.round,
      tribunalPolicy: input.tribunalPolicy,
      outcome,
      decisionPolicy,
      voteCount,
      evidenceHashes: canonicalData.evidenceHashes,
      compiledAt: Date.now(),
      payloadHash,
    };

    return payload;
  }

  private determineOutcome(
    votes: { outcome: RulingOutcome }[],
    policy: TribunalPolicy
  ): RulingOutcome {
    const voteCounts: Record<RulingOutcome, number> = {
      [RulingOutcome.GRANTED]: 0,
      [RulingOutcome.DENIED]: 0,
      [RulingOutcome.DISMISSED]: 0,
      [RulingOutcome.REMANDED]: 0,
    };

    for (const vote of votes) {
      voteCounts[vote.outcome]++;
    }

    if (policy === TribunalPolicy.SOLE_ARBITRATOR) {
      return votes[0].outcome;
    }

    const total = votes.length;
    const majorityThreshold = Math.floor(total / 2) + 1;

    for (const outcome of [RulingOutcome.GRANTED, RulingOutcome.DENIED, RulingOutcome.DISMISSED, RulingOutcome.REMANDED]) {
      if (voteCounts[outcome] >= majorityThreshold) {
        return outcome;
      }
    }

    return RulingOutcome.DISMISSED;
  }

  private determineDecisionPolicy(
    votes: { outcome: RulingOutcome }[],
    policy: TribunalPolicy
  ): DecisionPolicy {
    if (policy === TribunalPolicy.SOLE_ARBITRATOR) {
      return DecisionPolicy.SOLE;
    }

    const total = votes.length;
    const voteCounts: Record<RulingOutcome, number> = {
      [RulingOutcome.GRANTED]: 0,
      [RulingOutcome.DENIED]: 0,
      [RulingOutcome.DISMISSED]: 0,
      [RulingOutcome.REMANDED]: 0,
    };

    for (const vote of votes) {
      voteCounts[vote.outcome]++;
    }

    for (const count of Object.values(voteCounts)) {
      if (count === total) {
        return DecisionPolicy.UNANIMOUS;
      }
    }

    return DecisionPolicy.MAJORITY;
  }

  getRuling(caseId: string, round: number): RulingState | undefined {
    const key = `${caseId}:${round}`;
    return this.rulings.get(key);
  }

  recordRuling(payload: RulingPayload, proposalId?: string): RulingState {
    const key = `${payload.caseId}:${payload.round}`;
    
    if (this.rulings.has(key)) {
      throw new Error(`Ruling already exists for case ${payload.caseId} round ${payload.round}`);
    }

    const state: RulingState = {
      caseId: payload.caseId,
      disputeId: payload.disputeId,
      round: payload.round,
      outcome: payload.outcome,
      decisionPolicy: payload.decisionPolicy,
      payloadHash: payload.payloadHash,
      executedAt: payload.compiledAt,
      proposalId,
    };

    this.rulings.set(key, state);
    return state;
  }

  hasRuling(caseId: string, round: number): boolean {
    const key = `${caseId}:${round}`;
    return this.rulings.has(key);
  }
}
