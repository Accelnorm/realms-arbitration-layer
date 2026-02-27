import { PublicKey } from '@solana/web3.js';
import { RoleModel } from '../modules/roleModel';
import { ArbitratorRoster } from '../modules/roster';
import { Tribunal, TribunalConfig } from '../modules/tribunal';
import { TribunalPolicy, TribunalStatus, ConflictStatus } from '../types/tribunal';

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const CASE_MANAGER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const ARBITRATOR_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const ARBITRATOR_KEY_2 = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');
const ARBITRATOR_KEY_3 = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');
const EXECUTOR_KEY = new PublicKey('7xJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');

describe('SI-007 Tribunal Assignment', () => {
  let roleModel: RoleModel;
  let roster: ArbitratorRoster;
  let tribunal: Tribunal;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [],
    });
    roster = new ArbitratorRoster(roleModel);
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_2, 'Jane Doe', 'JD-002');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_3, 'Bob Smith', 'JD-003');
    tribunal = new Tribunal(roleModel, roster);
  });

  test('should assign sole arbitrator tribunal', async () => {
    const config: TribunalConfig = {
      caseId: 'case-001',
      policy: TribunalPolicy.SOLE_ARBITRATOR,
    };

    const state = await tribunal.assignTribunal(CASE_MANAGER_KEY, config, [ARBITRATOR_KEY]);

    expect(state.policy).toBe(TribunalPolicy.SOLE_ARBITRATOR);
    expect(state.arbitrators).toHaveLength(1);
    expect(state.arbitrators[0].toBase58()).toBe(ARBITRATOR_KEY.toBase58());
    expect(state.status).toBe(TribunalStatus.CONFIGURED);
  });

  test('should assign three-member tribunal', async () => {
    const config: TribunalConfig = {
      caseId: 'case-002',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    const state = await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    expect(state.policy).toBe(TribunalPolicy.THREE_MEMBER);
    expect(state.arbitrators).toHaveLength(3);
    expect(state.status).toBe(TribunalStatus.CONFIGURED);
  });

  test('should reject sole arbitrator with wrong count', async () => {
    const config: TribunalConfig = {
      caseId: 'case-003',
      policy: TribunalPolicy.SOLE_ARBITRATOR,
    };

    await expect(
      tribunal.assignTribunal(CASE_MANAGER_KEY, config, [ARBITRATOR_KEY, ARBITRATOR_KEY_2])
    ).rejects.toThrow('Sole arbitrator policy requires exactly one arbitrator');
  });

  test('should reject three-member with wrong count', async () => {
    const config: TribunalConfig = {
      caseId: 'case-004',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await expect(
      tribunal.assignTribunal(CASE_MANAGER_KEY, config, [ARBITRATOR_KEY])
    ).rejects.toThrow('Three-member policy requires exactly three arbitrators');
  });

  test('should reject unauthorized tribunal assignment', async () => {
    const config: TribunalConfig = {
      caseId: 'case-005',
      policy: TribunalPolicy.SOLE_ARBITRATOR,
    };

    await expect(
      tribunal.assignTribunal(ADMIN_KEY, config, [ARBITRATOR_KEY])
    ).rejects.toThrow('Unauthorized');
  });

  test('should reject arbitrator not in roster', async () => {
    const unknownArb = new PublicKey('9xJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
    const config: TribunalConfig = {
      caseId: 'case-006',
      policy: TribunalPolicy.SOLE_ARBITRATOR,
    };

    await expect(
      tribunal.assignTribunal(CASE_MANAGER_KEY, config, [unknownArb])
    ).rejects.toThrow('not found in roster');
  });

  test('should confirm tribunal assignment', async () => {
    const config: TribunalConfig = {
      caseId: 'case-007',
      policy: TribunalPolicy.SOLE_ARBITRATOR,
    };

    await tribunal.assignTribunal(CASE_MANAGER_KEY, config, [ARBITRATOR_KEY]);
    tribunal.confirmTribunal('case-007');

    const state = tribunal.getTribunal('case-007');
    expect(state?.status).toBe(TribunalStatus.ACTIVE);
    expect(state?.confirmedAt).toBeGreaterThan(0);
  });
});

describe('SI-008 Conflict Disclosure Gate', () => {
  let roleModel: RoleModel;
  let roster: ArbitratorRoster;
  let tribunal: Tribunal;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [],
    });
    roster = new ArbitratorRoster(roleModel);
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_2, 'Jane Doe', 'JD-002');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_3, 'Bob Smith', 'JD-003');
    tribunal = new Tribunal(roleModel, roster);
  });

  test('should disclose conflict for arbitrator', async () => {
    const config: TribunalConfig = {
      caseId: 'case-008',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    const conflict = tribunal.discloseConflict('case-008', ARBITRATOR_KEY, 'Conflict of interest');

    expect(conflict.status).toBe(ConflictStatus.DISCLOSED);
    expect(conflict.arbitrator.toBase58()).toBe(ARBITRATOR_KEY.toBase58());
    expect(conflict.disclosedAt).toBeGreaterThan(0);
  });

  test('should block final tribunal confirmation with unresolved conflict', async () => {
    const config: TribunalConfig = {
      caseId: 'case-009',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    tribunal.discloseConflict('case-009', ARBITRATOR_KEY, 'Conflict');

    const canConfirm = tribunal.canConfirmTribunal('case-009');
    expect(canConfirm).toBe(false);
  });

  test('should allow confirmation after all conflicts resolved', async () => {
    const config: TribunalConfig = {
      caseId: 'case-010',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    tribunal.discloseConflict('case-010', ARBITRATOR_KEY, 'Conflict');
    tribunal.recuseArbitrator('case-010', ARBITRATOR_KEY);
    tribunal.replaceArbitrator('case-010', ARBITRATOR_KEY, ARBITRATOR_KEY_2);

    const canConfirm = tribunal.canConfirmTribunal('case-010');
    expect(canConfirm).toBe(true);
  });

  test('should reject conflict disclosure for non-member', async () => {
    const unknownArb = new PublicKey('9xJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
    const config: TribunalConfig = {
      caseId: 'case-011',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    expect(() => {
      tribunal.discloseConflict('case-011', unknownArb, 'Not a member');
    }).toThrow('Arbitrator is not a member of this tribunal');
  });
});

describe('SI-009 Recusal Replacement', () => {
  let roleModel: RoleModel;
  let roster: ArbitratorRoster;
  let tribunal: Tribunal;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [],
    });
    roster = new ArbitratorRoster(roleModel);
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_2, 'Jane Doe', 'JD-002');
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_3, 'Bob Smith', 'JD-003');
    tribunal = new Tribunal(roleModel, roster);
  });

  test('should recuse conflicted arbitrator', async () => {
    const config: TribunalConfig = {
      caseId: 'case-012',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    tribunal.discloseConflict('case-012', ARBITRATOR_KEY, 'Conflict');
    tribunal.recuseArbitrator('case-012', ARBITRATOR_KEY);

    const tribunalState = tribunal.getTribunal('case-012');
    const conflict = tribunalState?.conflicts.find(
      c => c.arbitrator.toBase58() === ARBITRATOR_KEY.toBase58()
    );
    expect(conflict?.status).toBe(ConflictStatus.RECUSED);
  });

  test('should replace recused arbitrator and preserve tribunal composition', async () => {
    const config: TribunalConfig = {
      caseId: 'case-013',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    tribunal.discloseConflict('case-013', ARBITRATOR_KEY, 'Conflict');
    tribunal.recuseArbitrator('case-013', ARBITRATOR_KEY);
    tribunal.replaceArbitrator('case-013', ARBITRATOR_KEY, ARBITRATOR_KEY_2);

    const tribunalState = tribunal.getTribunal('case-013');
    expect(tribunalState?.arbitrators).toHaveLength(3);
    expect(tribunalState?.arbitrators[0].toBase58()).toBe(ARBITRATOR_KEY_2.toBase58());
  });

  test('should maintain policy compliance after replacement', async () => {
    const config: TribunalConfig = {
      caseId: 'case-014',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    tribunal.discloseConflict('case-014', ARBITRATOR_KEY, 'Conflict');
    tribunal.recuseArbitrator('case-014', ARBITRATOR_KEY);
    tribunal.replaceArbitrator('case-014', ARBITRATOR_KEY, ARBITRATOR_KEY_2);

    const isCompliant = tribunal.isPolicyCompliant('case-014');
    expect(isCompliant).toBe(true);
  });

  test('should reject replacement of non-recused arbitrator', async () => {
    const config: TribunalConfig = {
      caseId: 'case-015',
      policy: TribunalPolicy.THREE_MEMBER,
    };

    await tribunal.assignTribunal(
      CASE_MANAGER_KEY,
      config,
      [ARBITRATOR_KEY, ARBITRATOR_KEY_2, ARBITRATOR_KEY_3]
    );

    expect(() => {
      tribunal.replaceArbitrator('case-015', ARBITRATOR_KEY, ARBITRATOR_KEY_2);
    }).toThrow('Arbitrator is not recused');
  });
});
