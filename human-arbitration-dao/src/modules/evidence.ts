import { PublicKey } from '@solana/web3.js';
import { createHash } from 'crypto';
import {
  EvidenceAnchor,
  EvidenceRef,
  EvidenceState,
  EvidenceError,
} from '../types/evidence';
import { CaseManager } from './case';
import { RoleModel } from './roleModel';

export class EvidenceManager {
  private roleModel: RoleModel;
  private caseManager: CaseManager;
  private evidenceStore: Map<string, EvidenceState>;

  constructor(roleModel: RoleModel, caseManager: CaseManager) {
    this.roleModel = roleModel;
    this.caseManager = caseManager;
    this.evidenceStore = new Map();
  }

  anchorEvidence(
    caseId: string,
    submitter: PublicKey,
    evidenceRefs: EvidenceRef[]
  ): EvidenceAnchor[] {
    const caseState = this.caseManager.getCase(caseId);
    if (!caseState) {
      throw new Error(EvidenceError.CASE_NOT_FOUND);
    }

    this.roleModel.checkAuthorization(submitter, 'evidence.attach');

    const anchors: EvidenceAnchor[] = evidenceRefs.map((ref) => {
      const computedHash = this.computeHash(ref.uri);
      if (ref.hash && ref.hash !== computedHash) {
        throw new Error(EvidenceError.INVALID_HASH);
      }

      const anchor: EvidenceAnchor = {
        caseId,
        evidenceHash: computedHash,
        uri: ref.uri,
        submitter,
        timestamp: Date.now(),
      };

      return anchor;
    });

    let state = this.evidenceStore.get(caseId);
    if (!state) {
      state = { caseId, anchors: [] };
      this.evidenceStore.set(caseId, state);
    }

    for (const anchor of anchors) {
      const exists = state.anchors.some(
        (a) => a.evidenceHash === anchor.evidenceHash
      );
      if (exists) {
        throw new Error(EvidenceError.ALREADY_ANCHORED);
      }
      state.anchors.push(anchor);
    }

    return anchors;
  }

  getEvidenceAnchors(caseId: string): EvidenceAnchor[] {
    const state = this.evidenceStore.get(caseId);
    return state?.anchors ?? [];
  }

  verifyEvidenceLinkage(caseId: string, evidenceHash: string): boolean {
    const state = this.evidenceStore.get(caseId);
    if (!state) {
      return false;
    }
    return state.anchors.some((a) => a.evidenceHash === evidenceHash);
  }

  computeHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  isEvidenceImmutable(caseId: string, evidenceHash: string): boolean {
    const anchors = this.getEvidenceAnchors(caseId);
    const anchor = anchors.find((a) => a.evidenceHash === evidenceHash);
    return !!anchor;
  }

  getEvidenceState(caseId: string): EvidenceState | undefined {
    return this.evidenceStore.get(caseId);
  }

  getAllEvidenceStates(): EvidenceState[] {
    return Array.from(this.evidenceStore.values());
  }
}
