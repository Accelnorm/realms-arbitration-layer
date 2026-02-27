import { PublicKey } from '@solana/web3.js';
import { RoleModel, RoleModelConfig } from '../modules/roleModel';
import { ArbitratorRoster } from '../modules/roster';
import { Role } from '../types/roles';
import { RosterAction } from '../types/roster';

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const CASE_MANAGER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const ARBITRATOR_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const ARBITRATOR_KEY_2 = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');
const EXECUTOR_KEY = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');
const OBSERVER_KEY = new PublicKey('7xJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');

describe('SI-005 Roster Registration', () => {
  let roleModel: RoleModel;
  let roster: ArbitratorRoster;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [OBSERVER_KEY],
    });
    roster = new ArbitratorRoster(roleModel);
  });

  test('should register arbitrator to roster', async () => {
    const state = await roster.addArbitrator(
      ADMIN_KEY,
      ARBITRATOR_KEY,
      'John Doe',
      'JD-001'
    );

    const active = roster.getActiveArbitrators();
    expect(active).toHaveLength(1);
    expect(active[0].arbitrator.toBase58()).toBe(ARBITRATOR_KEY.toBase58());
    expect(active[0].name).toBe('John Doe');
  });

  test('should allow authorized roster manager to add arbitrators', async () => {
    const config: RoleModelConfig = {
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [],
    };
    
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize(config);
    roster = new ArbitratorRoster(roleModel);

    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'Jane Doe', 'JD-002');

    const active = roster.getActiveArbitrators();
    expect(active).toHaveLength(1);
  });

  test('should reject duplicate arbitrator registration', async () => {
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');

    await expect(
      roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001')
    ).rejects.toThrow('Arbitrator already exists');
  });

  test('should reject unauthorized roster add', async () => {
    const unauthorizedRoleModel = new RoleModel(ADMIN_KEY);
    await unauthorizedRoleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [],
      observers: [OBSERVER_KEY],
    });
    const unauthorizedRoster = new ArbitratorRoster(unauthorizedRoleModel);

    await expect(
      unauthorizedRoster.addArbitrator(OBSERVER_KEY, ARBITRATOR_KEY, 'Test', 'T-001')
    ).rejects.toThrow('Unauthorized');
  });
});

describe('SI-006 Roster Version Audit', () => {
  let roleModel: RoleModel;
  let roster: ArbitratorRoster;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [EXECUTOR_KEY],
      observers: [OBSERVER_KEY],
    });
    roster = new ArbitratorRoster(roleModel);
  });

  test('should increment version on roster update', async () => {
    const initialVersion = roster.getState().version;

    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    expect(roster.getState().version).toBe(initialVersion + 1);

    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY_2, 'Jane Doe', 'JD-002');
    expect(roster.getState().version).toBe(initialVersion + 2);
  });

  test('should create audit record on roster change', async () => {
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');

    const auditRecords = roster.getAuditRecords();
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0].action).toBe(RosterAction.ADD);
    expect(auditRecords[0].arbitrator.toBase58()).toBe(ARBITRATOR_KEY.toBase58());
  });

  test('should track version with each audit record', async () => {
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    
    const auditRecords = roster.getAuditRecords();
    expect(auditRecords[0].version).toBeGreaterThan(0);
    expect(auditRecords[0].timestamp).toBeGreaterThan(0);
  });

  test('should remove arbitrator and create audit record', async () => {
    await roster.addArbitrator(ADMIN_KEY, ARBITRATOR_KEY, 'John Doe', 'JD-001');
    const versionAfterAdd = roster.getState().version;

    await roster.removeArbitrator(ADMIN_KEY, ARBITRATOR_KEY);
    
    const auditRecords = roster.getAuditRecords();
    expect(auditRecords).toHaveLength(2);
    expect(auditRecords[1].action).toBe(RosterAction.REMOVE);
    expect(roster.getState().version).toBe(versionAfterAdd + 1);
  });
});
