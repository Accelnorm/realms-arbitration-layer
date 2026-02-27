import { PublicKey } from '@solana/web3.js';
import { Case, CaseState, CaseStatus, CaseIntakeInput } from '../types/case';
import { RoleModel } from './roleModel';
import { createHash } from 'crypto';

export class CaseManager {
  private roleModel: RoleModel;
  private cases: Map<string, CaseState>;

  constructor(roleModel: RoleModel) {
    this.roleModel = roleModel;
    this.cases = new Map();
  }

  async intake(
    caseManager: PublicKey,
    input: CaseIntakeInput
  ): Promise<CaseState> {
    this.roleModel.checkAuthorization(caseManager, 'case.create');

    const caseId = this.deriveCaseId(input);

    if (this.cases.has(caseId)) {
      throw new Error('Case already exists for this dispute');
    }

    const state: CaseState = {
      caseId,
      disputeId: input.disputeId,
      status: CaseStatus.DOCKETED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      round: 0,
      evidenceHashes: input.evidenceRefs.map(ref => this.hashEvidence(ref)),
    };

    this.cases.set(caseId, state);
    return state;
  }

  deriveCaseId(input: CaseIntakeInput): string {
    const data = JSON.stringify({
      disputeId: input.disputeId,
      challenger: input.challenger.toBase58(),
      challenged: input.challenged.toBase58(),
    });
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private hashEvidence(ref: string): string {
    return createHash('sha256').update(ref).digest('hex');
  }

  getCase(caseId: string): CaseState | undefined {
    return this.cases.get(caseId);
  }

  getAllCases(): CaseState[] {
    return Array.from(this.cases.values());
  }

  updateCaseStatus(caseId: string, status: CaseStatus): void {
    const caseState = this.cases.get(caseId);
    if (!caseState) {
      throw new Error('Case not found');
    }
    caseState.status = status;
    caseState.updatedAt = Date.now();
  }

  incrementRound(caseId: string): void {
    const caseState = this.cases.get(caseId);
    if (!caseState) {
      throw new Error('Case not found');
    }
    caseState.round++;
    caseState.updatedAt = Date.now();
  }
}
