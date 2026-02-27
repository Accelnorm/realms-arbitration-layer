import { PublicKey } from '@solana/web3.js';
import { Role, RoleAssignment, RoleState, hasPermission, ROLE_PERMISSIONS } from '../types/roles';

export interface RoleModelConfig {
  admin: PublicKey;
  caseManager: PublicKey;
  arbitrators: PublicKey[];
  executors: PublicKey[];
  observers: PublicKey[];
}

export class RoleModel {
  private state: RoleState;
  private admin: PublicKey;

  constructor(admin: PublicKey) {
    this.admin = admin;
    this.state = {
      roles: new Map(),
      assignments: [],
    };
  }

  async initialize(config: RoleModelConfig): Promise<RoleState> {
    this.assignRole(config.admin, Role.ADMIN);
    this.assignRole(config.caseManager, Role.CASE_MANAGER);
    
    for (const arbitrator of config.arbitrators) {
      this.assignRole(arbitrator, Role.ARBITRATOR);
    }
    
    for (const executor of config.executors) {
      this.assignRole(executor, Role.EXECUTOR);
    }
    
    for (const observer of config.observers) {
      this.assignRole(observer, Role.OBSERVER);
    }

    return this.state;
  }

  private assignRole(pubkey: PublicKey, role: Role): void {
    const key = pubkey.toBase58();
    this.state.roles.set(key, role);
    this.state.assignments.push({
      role,
      pubkey: key,
      assignedAt: Date.now(),
    });
  }

  getRole(pubkey: PublicKey): Role | undefined {
    return this.state.roles.get(pubkey.toBase58());
  }

  hasPermission(pubkey: PublicKey, action: string): boolean {
    const role = this.getRole(pubkey);
    if (!role) return false;
    return hasPermission(role, action);
  }

  checkAuthorization(pubkey: PublicKey, action: string): void {
    if (!this.hasPermission(pubkey, action)) {
      const role = this.getRole(pubkey);
      throw new AuthorizationError(
        `Unauthorized: role ${role ?? 'none'} cannot perform action ${action}`
      );
    }
  }

  getAssignments(): RoleAssignment[] {
    return [...this.state.assignments];
  }

  getAllRoles(): Map<string, Role> {
    return new Map(this.state.roles);
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}
