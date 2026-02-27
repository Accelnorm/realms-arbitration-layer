import { PublicKey } from '@solana/web3.js';
import { RoleModel } from '../modules/roleModel';
import { CaseManager } from '../modules/case';
import { EvidenceManager } from '../modules/evidence';
import { EvidenceError } from '../types/evidence';

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const CASE_MANAGER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const CHALLENGER_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const CHALLENGED_KEY = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');

describe('SI-012 Evidence Hash Anchoring', () => {
  let roleModel: RoleModel;
  let caseManager: CaseManager;
  let evidenceManager: EvidenceManager;
  let testCaseId: string;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [],
      observers: [],
    });
    caseManager = new CaseManager(roleModel);
    evidenceManager = new EvidenceManager(roleModel, caseManager);

    const caseState = await caseManager.intake(CASE_MANAGER_KEY, {
      disputeId: 'dispute-001',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    });
    testCaseId = caseState.caseId;
  });

  test('should anchor evidence and store immutable hash linkage', async () => {
    const evidenceRefs = [
      { uri: 'ipfs://QmEvidence1', hash: '' },
      { uri: 'ipfs://QmEvidence2', hash: '' },
    ];

    const anchors = evidenceManager.anchorEvidence(
      testCaseId,
      CASE_MANAGER_KEY,
      evidenceRefs
    );

    expect(anchors).toHaveLength(2);
    expect(anchors[0].caseId).toBe(testCaseId);
    expect(anchors[0].evidenceHash).toBeDefined();
    expect(anchors[0].uri).toBe('ipfs://QmEvidence1');
    expect(anchors[0].submitter.toBase58()).toBe(CASE_MANAGER_KEY.toBase58());
    expect(anchors[0].timestamp).toBeGreaterThan(0);
  });

  test('should compute deterministic hash for same evidence', () => {
    const hash1 = evidenceManager.computeHash('ipfs://QmEvidence');
    const hash2 = evidenceManager.computeHash('ipfs://QmEvidence');

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  test('should generate different hashes for different evidence', () => {
    const hash1 = evidenceManager.computeHash('ipfs://QmEvidence1');
    const hash2 = evidenceManager.computeHash('ipfs://QmEvidence2');

    expect(hash1).not.toBe(hash2);
  });

  test('should verify evidence linkage exists', () => {
    const evidenceRefs = [{ uri: 'ipfs://QmEvidence1', hash: '' }];
    const anchors = evidenceManager.anchorEvidence(
      testCaseId,
      CASE_MANAGER_KEY,
      evidenceRefs
    );

    const isLinked = evidenceManager.verifyEvidenceLinkage(
      testCaseId,
      anchors[0].evidenceHash
    );

    expect(isLinked).toBe(true);
  });

  test('should return false for non-existent evidence linkage', () => {
    const isLinked = evidenceManager.verifyEvidenceLinkage(
      testCaseId,
      'non-existent-hash'
    );

    expect(isLinked).toBe(false);
  });

  test('should confirm evidence immutability', () => {
    const evidenceRefs = [{ uri: 'ipfs://QmEvidence1', hash: '' }];
    const anchors = evidenceManager.anchorEvidence(
      testCaseId,
      CASE_MANAGER_KEY,
      evidenceRefs
    );

    const isImmutable = evidenceManager.isEvidenceImmutable(
      testCaseId,
      anchors[0].evidenceHash
    );

    expect(isImmutable).toBe(true);
  });

  test('should reject evidence anchoring for non-existent case', () => {
    expect(() => {
      evidenceManager.anchorEvidence(
        'non-existent-case',
        CASE_MANAGER_KEY,
        [{ uri: 'ipfs://QmEvidence', hash: '' }]
      );
    }).toThrow(EvidenceError.CASE_NOT_FOUND);
  });

  test('should reject unauthorized evidence attachment', async () => {
    const caseState = await caseManager.intake(CASE_MANAGER_KEY, {
      disputeId: 'dispute-002',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    });

    const otherKey = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');

    expect(() => {
      evidenceManager.anchorEvidence(
        caseState.caseId,
        otherKey,
        [{ uri: 'ipfs://QmEvidence', hash: '' }]
      );
    }).toThrow('Unauthorized');
  });

  test('should retrieve evidence anchors for case', () => {
    const evidenceRefs = [
      { uri: 'ipfs://QmEvidence1', hash: '' },
      { uri: 'ipfs://QmEvidence2', hash: '' },
    ];
    evidenceManager.anchorEvidence(
      testCaseId,
      CASE_MANAGER_KEY,
      evidenceRefs
    );

    const anchors = evidenceManager.getEvidenceAnchors(testCaseId);

    expect(anchors).toHaveLength(2);
  });

  test('should return empty array for case with no evidence', () => {
    const anchors = evidenceManager.getEvidenceAnchors(testCaseId);

    expect(anchors).toHaveLength(0);
  });

  test('should validate hash when provided', () => {
    const correctHash = evidenceManager.computeHash('ipfs://QmEvidence');

    expect(() => {
      evidenceManager.anchorEvidence(
        testCaseId,
        CASE_MANAGER_KEY,
        [{ uri: 'ipfs://QmEvidence', hash: correctHash }]
      );
    }).not.toThrow();

    expect(() => {
      evidenceManager.anchorEvidence(
        testCaseId,
        CASE_MANAGER_KEY,
        [{ uri: 'ipfs://QmEvidence', hash: 'wrong-hash' }]
      );
    }).toThrow(EvidenceError.INVALID_HASH);
  });

  test('should store evidence state with anchors', () => {
    const evidenceRefs = [{ uri: 'ipfs://QmEvidence1', hash: '' }];
    evidenceManager.anchorEvidence(
      testCaseId,
      CASE_MANAGER_KEY,
      evidenceRefs
    );

    const state = evidenceManager.getEvidenceState(testCaseId);

    expect(state).toBeDefined();
    expect(state?.caseId).toBe(testCaseId);
    expect(state?.anchors).toHaveLength(1);
  });
});
