import { PublicKey } from '@solana/web3.js';
import { RoleModel } from '../modules/roleModel';
import { CaseManager } from '../modules/case';
import { CaseStatus } from '../types/case';

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const CASE_MANAGER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const CHALLENGER_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const CHALLENGED_KEY = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');

describe('SI-010 Dispute Intake', () => {
  let roleModel: RoleModel;
  let caseManager: CaseManager;

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
  });

  test('should ingest challenged dispute and create case docket', async () => {
    const intakeInput = {
      disputeId: 'dispute-001',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: ['evidence-ref-1', 'evidence-ref-2'],
    };

    const caseState = await caseManager.intake(CASE_MANAGER_KEY, intakeInput);

    expect(caseState.caseId).toBeDefined();
    expect(caseState.disputeId).toBe('dispute-001');
    expect(caseState.status).toBe(CaseStatus.DOCKETED);
    expect(caseState.round).toBe(0);
    expect(caseState.evidenceHashes).toHaveLength(2);
    expect(caseState.createdAt).toBeGreaterThan(0);
    expect(caseState.updatedAt).toBeGreaterThan(0);
  });

  test('should reject duplicate case for same dispute', async () => {
    const intakeInput = {
      disputeId: 'dispute-002',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    await caseManager.intake(CASE_MANAGER_KEY, intakeInput);

    await expect(
      caseManager.intake(CASE_MANAGER_KEY, intakeInput)
    ).rejects.toThrow('Case already exists for this dispute');
  });

  test('should reject unauthorized case intake', async () => {
    const intakeInput = {
      disputeId: 'dispute-003',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    await expect(
      caseManager.intake(ADMIN_KEY, intakeInput)
    ).rejects.toThrow('Unauthorized');
  });

  test('should retrieve case by caseId', async () => {
    const intakeInput = {
      disputeId: 'dispute-004',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    const created = await caseManager.intake(CASE_MANAGER_KEY, intakeInput);
    const retrieved = caseManager.getCase(created.caseId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.caseId).toBe(created.caseId);
    expect(retrieved?.disputeId).toBe('dispute-004');
  });

  test('should list all cases', async () => {
    const intakeInput1 = {
      disputeId: 'dispute-005',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };
    const intakeInput2 = {
      disputeId: 'dispute-006',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    await caseManager.intake(CASE_MANAGER_KEY, intakeInput1);
    await caseManager.intake(CASE_MANAGER_KEY, intakeInput2);

    const allCases = caseManager.getAllCases();

    expect(allCases).toHaveLength(2);
  });
});

describe('SI-011 Deterministic Case Docket', () => {
  let roleModel: RoleModel;
  let caseManager: CaseManager;

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
  });

  test('should generate identical case ID for same input', () => {
    const intakeInput = {
      disputeId: 'dispute-deterministic',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    const caseId1 = caseManager.deriveCaseId(intakeInput);
    const caseId2 = caseManager.deriveCaseId(intakeInput);
    const caseId3 = caseManager.deriveCaseId(intakeInput);

    expect(caseId1).toBe(caseId2);
    expect(caseId2).toBe(caseId3);
  });

  test('should generate different case IDs for different dispute IDs', () => {
    const intakeInput1 = {
      disputeId: 'dispute-A',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };
    const intakeInput2 = {
      disputeId: 'dispute-B',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    const caseId1 = caseManager.deriveCaseId(intakeInput1);
    const caseId2 = caseManager.deriveCaseId(intakeInput2);

    expect(caseId1).not.toBe(caseId2);
  });

  test('should generate different case IDs for different challengers', () => {
    const challenger2 = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');
    
    const intakeInput1 = {
      disputeId: 'dispute-same',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };
    const intakeInput2 = {
      disputeId: 'dispute-same',
      challenger: challenger2,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    const caseId1 = caseManager.deriveCaseId(intakeInput1);
    const caseId2 = caseManager.deriveCaseId(intakeInput2);

    expect(caseId1).not.toBe(caseId2);
  });

  test('should generate different case IDs for different challenged parties', () => {
    const challenged2 = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');
    
    const intakeInput1 = {
      disputeId: 'dispute-same',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };
    const intakeInput2 = {
      disputeId: 'dispute-same',
      challenger: CHALLENGER_KEY,
      challenged: challenged2,
      evidenceRefs: [],
    };

    const caseId1 = caseManager.deriveCaseId(intakeInput1);
    const caseId2 = caseManager.deriveCaseId(intakeInput2);

    expect(caseId1).not.toBe(caseId2);
  });

  test('should generate case ID with correct length', () => {
    const intakeInput = {
      disputeId: 'dispute-length-test',
      challenger: CHALLENGER_KEY,
      challenged: CHALLENGED_KEY,
      evidenceRefs: [],
    };

    const caseId = caseManager.deriveCaseId(intakeInput);

    expect(caseId).toHaveLength(16);
  });
});
