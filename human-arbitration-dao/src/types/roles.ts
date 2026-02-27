export enum Role {
  ADMIN = 'admin',
  CASE_MANAGER = 'case_manager',
  ARBITRATOR = 'arbitrator',
  EXECUTOR = 'executor',
  OBSERVER = 'observer',
}

export interface RoleAssignment {
  role: Role;
  pubkey: string;
  assignedAt: number;
}

export interface RoleState {
  roles: Map<string, Role>;
  assignments: RoleAssignment[];
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  [Role.ADMIN]: ['role.assign', 'role.revoke', 'roster.add', 'roster.remove', 'dao.config'],
  [Role.CASE_MANAGER]: ['case.create', 'case.assign', 'tribunal.assign', 'conflict.resolve', 'evidence.attach'],
  [Role.ARBITRATOR]: ['case.vote', 'case.disclose', 'case.recuse'],
  [Role.EXECUTOR]: ['proposal.execute', 'ruling.write'],
  [Role.OBSERVER]: ['case.read', 'case.evidence'],
};

export function hasPermission(role: Role, action: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}
