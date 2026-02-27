import { PublicKey } from '@solana/web3.js';
import {
  TribunalPolicy,
  TribunalStatus,
  TribunalState,
  Conflict,
  ConflictStatus,
} from '../types/tribunal';
import { RoleModel } from './roleModel';
import { ArbitratorRoster } from './roster';

export interface TribunalConfig {
  caseId: string;
  policy: TribunalPolicy;
}

export class Tribunal {
  private roleModel: RoleModel;
  private roster: ArbitratorRoster;
  private tribunals: Map<string, TribunalState>;

  constructor(roleModel: RoleModel, roster: ArbitratorRoster) {
    this.roleModel = roleModel;
    this.roster = roster;
    this.tribunals = new Map();
  }

  async assignTribunal(
    caseManager: PublicKey,
    config: TribunalConfig,
    arbitratorPubkeys: PublicKey[]
  ): Promise<TribunalState> {
    this.roleModel.checkAuthorization(caseManager, 'tribunal.assign');

    if (config.policy === TribunalPolicy.SOLE_ARBITRATOR) {
      if (arbitratorPubkeys.length !== 1) {
        throw new Error('Sole arbitrator policy requires exactly one arbitrator');
      }
    } else if (config.policy === TribunalPolicy.THREE_MEMBER) {
      if (arbitratorPubkeys.length !== 3) {
        throw new Error('Three-member policy requires exactly three arbitrators');
      }
    }

    for (const arb of arbitratorPubkeys) {
      const rosterEntry = this.roster.getArbitrator(arb);
      if (!rosterEntry) {
        throw new Error(`Arbitrator ${arb.toBase58()} not found in roster`);
      }
    }

    const state: TribunalState = {
      caseId: config.caseId,
      policy: config.policy,
      arbitrators: arbitratorPubkeys,
      status: TribunalStatus.CONFIGURED,
      assignedAt: Date.now(),
      conflicts: [],
    };

    this.tribunals.set(config.caseId, state);
    return state;
  }

  getTribunal(caseId: string): TribunalState | undefined {
    return this.tribunals.get(caseId);
  }

  getAllTribunals(): TribunalState[] {
    return Array.from(this.tribunals.values());
  }

  confirmTribunal(caseId: string): void {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      throw new Error('Tribunal not found');
    }
    tribunal.status = TribunalStatus.ACTIVE;
    tribunal.confirmedAt = Date.now();
  }

  discloseConflict(caseId: string, arbitrator: PublicKey, reason: string): Conflict {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      throw new Error('Tribunal not found');
    }

    const isMember = tribunal.arbitrators.some(a => a.equals(arbitrator));
    if (!isMember) {
      throw new Error('Arbitrator is not a member of this tribunal');
    }

    const existingConflict = tribunal.conflicts.find(
      c => c.arbitrator.equals(arbitrator) && c.status !== ConflictStatus.RESOLVED
    );
    if (existingConflict) {
      throw new Error('Conflict already disclosed for this arbitrator');
    }

    const conflict: Conflict = {
      arbitrator,
      caseId,
      status: ConflictStatus.DISCLOSED,
      disclosedAt: Date.now(),
    };

    tribunal.conflicts.push(conflict);
    tribunal.status = TribunalStatus.CONFLICT_DISCLOSED;

    return conflict;
  }

  hasUnresolvedConflicts(caseId: string): boolean {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      return false;
    }

    return tribunal.conflicts.some(c => c.status !== ConflictStatus.RESOLVED);
  }

  canConfirmTribunal(caseId: string): boolean {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      return false;
    }

    if (tribunal.status !== TribunalStatus.CONFIGURED && 
        tribunal.status !== TribunalStatus.CONFLICT_DISCLOSED) {
      return false;
    }

    return !this.hasUnresolvedConflicts(caseId);
  }

  recuseArbitrator(caseId: string, arbitrator: PublicKey): void {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      throw new Error('Tribunal not found');
    }

    const conflict = tribunal.conflicts.find(
      c => c.arbitrator.equals(arbitrator) && c.status === ConflictStatus.DISCLOSED
    );
    if (!conflict) {
      throw new Error('No disclosed conflict found for this arbitrator');
    }

    conflict.status = ConflictStatus.RECUSED;
  }

  replaceArbitrator(
    caseId: string,
    recusedArbitrator: PublicKey,
    newArbitrator: PublicKey
  ): void {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      throw new Error('Tribunal not found');
    }

    const rosterEntry = this.roster.getArbitrator(newArbitrator);
    if (!rosterEntry) {
      throw new Error(`Arbitrator ${newArbitrator.toBase58()} not found in roster`);
    }

    const conflict = tribunal.conflicts.find(
      c => c.arbitrator.equals(recusedArbitrator) && c.status === ConflictStatus.RECUSED
    );
    if (!conflict) {
      throw new Error('Arbitrator is not recused');
    }

    const arbIndex = tribunal.arbitrators.findIndex(a => a.equals(recusedArbitrator));
    if (arbIndex === -1) {
      throw new Error('Arbitrator not found in tribunal');
    }

    tribunal.arbitrators[arbIndex] = newArbitrator;
    conflict.replacement = newArbitrator;
    conflict.status = ConflictStatus.RESOLVED;
    conflict.resolvedAt = Date.now();

    if (!this.hasUnresolvedConflicts(caseId)) {
      tribunal.status = TribunalStatus.CONFIGURED;
    }
  }

  isPolicyCompliant(caseId: string): boolean {
    const tribunal = this.tribunals.get(caseId);
    if (!tribunal) {
      return false;
    }

    const activeArbitrators = tribunal.arbitrators.filter(arb => {
      const conflict = tribunal.conflicts.find(
        c => c.arbitrator.equals(arb) && c.status !== ConflictStatus.RESOLVED
      );
      return !conflict;
    });

    if (tribunal.policy === TribunalPolicy.SOLE_ARBITRATOR) {
      return activeArbitrators.length === 1;
    } else if (tribunal.policy === TribunalPolicy.THREE_MEMBER) {
      return activeArbitrators.length === 3;
    }

    return false;
  }
}
