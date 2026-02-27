import { PublicKey } from '@solana/web3.js';
import { RoleModel, RoleModelConfig } from '../modules/roleModel';
import { Role, ROLE_PERMISSIONS, hasPermission } from '../types/roles';

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const CASE_MANAGER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const ARBITRATOR_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const EXECUTOR_KEY = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');
const OBSERVER_KEY = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');

describe('SI-003 Role Model Initialization', () => {
  let roleModel: RoleModel;

  beforeEach(() => {
    roleModel = new RoleModel(ADMIN_KEY);
  });

  test('should initialize admin role', async () => {
    const config: RoleModelConfig = {
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [],
      executors: [],
      observers: [],
    };

    const state = await roleModel.initialize(config);
    const adminRole = roleModel.getRole(config.admin);

    expect(adminRole).toBe(Role.ADMIN);
    expect(state.assignments.some(a => a.role === Role.ADMIN)).toBe(true);
  });

  test('should initialize all required roles', async () => {
    const config: RoleModelConfig = {
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [ARBITRATOR_KEY],
      executors: [EXECUTOR_KEY],
      observers: [OBSERVER_KEY],
    };

    await roleModel.initialize(config);

    expect(roleModel.getRole(config.admin)).toBe(Role.ADMIN);
    expect(roleModel.getRole(config.caseManager)).toBe(Role.CASE_MANAGER);
    expect(roleModel.getRole(config.arbitrators[0])).toBe(Role.ARBITRATOR);
    expect(roleModel.getRole(config.executors[0])).toBe(Role.EXECUTOR);
    expect(roleModel.getRole(config.observers[0])).toBe(Role.OBSERVER);
  });

  test('should have correct permissions for each role', () => {
    expect(ROLE_PERMISSIONS[Role.ADMIN]).toContain('role.assign');
    expect(ROLE_PERMISSIONS[Role.ADMIN]).toContain('roster.add');
    expect(ROLE_PERMISSIONS[Role.CASE_MANAGER]).toContain('case.create');
    expect(ROLE_PERMISSIONS[Role.ARBITRATOR]).toContain('case.vote');
    expect(ROLE_PERMISSIONS[Role.EXECUTOR]).toContain('proposal.execute');
    expect(ROLE_PERMISSIONS[Role.OBSERVER]).toContain('case.read');
  });
});

describe('SI-004 Role Authorization Guards', () => {
  let roleModel: RoleModel;

  beforeEach(async () => {
    roleModel = new RoleModel(ADMIN_KEY);
    await roleModel.initialize({
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      arbitrators: [ARBITRATOR_KEY],
      executors: [EXECUTOR_KEY],
      observers: [OBSERVER_KEY],
    });
  });

  test('should authorize admin for privileged actions', () => {
    expect(roleModel.hasPermission(ADMIN_KEY, 'role.assign')).toBe(true);
    expect(roleModel.hasPermission(ADMIN_KEY, 'roster.add')).toBe(true);
    expect(roleModel.hasPermission(ADMIN_KEY, 'dao.config')).toBe(true);
  });

  test('should authorize case manager for case actions', () => {
    expect(roleModel.hasPermission(CASE_MANAGER_KEY, 'case.create')).toBe(true);
    expect(roleModel.hasPermission(CASE_MANAGER_KEY, 'case.assign')).toBe(true);
    expect(roleModel.hasPermission(CASE_MANAGER_KEY, 'tribunal.assign')).toBe(true);
  });

  test('should reject unauthorized role actions', () => {
    expect(roleModel.hasPermission(OBSERVER_KEY, 'role.assign')).toBe(false);
    expect(roleModel.hasPermission(OBSERVER_KEY, 'case.create')).toBe(false);
    expect(roleModel.hasPermission(OBSERVER_KEY, 'proposal.execute')).toBe(false);
  });

  test('should throw AuthorizationError for unauthorized actions', () => {
    expect(() => roleModel.checkAuthorization(OBSERVER_KEY, 'role.assign')).toThrow('Unauthorized');
    expect(() => roleModel.checkAuthorization(OBSERVER_KEY, 'role.revoke')).toThrow('Unauthorized');
  });

  test('should reject actions from unknown pubkeys', () => {
    const unknown = new PublicKey('7xJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
    
    expect(roleModel.hasPermission(unknown, 'case.read')).toBe(false);
    expect(() => roleModel.checkAuthorization(unknown, 'case.read')).toThrow('Unauthorized');
  });
});
