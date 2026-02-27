import { PublicKey } from '@solana/web3.js';
import { RulingCompiler } from '../modules/ruling';
import { TribunalPolicy } from '../types/tribunal';
import { RulingOutcome, DecisionPolicy } from '../types/ruling';

const ARBITRATOR_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const ARBITRATOR_KEY_2 = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');
const ARBITRATOR_KEY_3 = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');

describe('SI-013 Deterministic Ruling Payload', () => {
  let compiler: RulingCompiler;

  beforeEach(() => {
    compiler = new RulingCompiler();
  });

  test('should produce identical payload for same input', () => {
    const input = {
      caseId: 'case-001',
      disputeId: 'dispute-001',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid claim', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid claim', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid claim', votedAt: Date.now() },
      ],
      evidenceHashes: ['hash1', 'hash2'],
    };

    const payload1 = compiler.compilePayload(input);
    const payload2 = compiler.compilePayload(input);

    expect(payload1.payloadHash).toBe(payload2.payloadHash);
    expect(payload1.caseId).toBe(payload2.caseId);
    expect(payload1.disputeId).toBe(payload2.disputeId);
    expect(payload1.round).toBe(payload2.round);
    expect(payload1.outcome).toBe(payload2.outcome);
    expect(payload1.decisionPolicy).toBe(payload2.decisionPolicy);
  });

  test('should produce deterministic hash for same case/dispute-round input', () => {
    const input = {
      caseId: 'case-002',
      disputeId: 'dispute-002',
      round: 1,
      tribunalPolicy: TribunalPolicy.SOLE_ARBITRATOR,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.DENIED, rationale: 'No merit', votedAt: Date.now() },
      ],
      evidenceHashes: ['hash1'],
    };

    const payload1 = compiler.compilePayload(input);
    const payload2 = compiler.compilePayload(input);

    expect(payload1.payloadHash).toBe(payload2.payloadHash);
    expect(payload1.outcome).toBe(RulingOutcome.DENIED);
    expect(payload1.decisionPolicy).toBe(DecisionPolicy.SOLE);
  });

  test('should generate different hashes for different inputs', () => {
    const input1 = {
      caseId: 'case-003',
      disputeId: 'dispute-003',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: ['hash1'],
    };

    const input2 = {
      caseId: 'case-004',
      disputeId: 'dispute-004',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: ['hash1'],
    };

    const payload1 = compiler.compilePayload(input1);
    const payload2 = compiler.compilePayload(input2);

    expect(payload1.payloadHash).not.toBe(payload2.payloadHash);
  });

  test('should determine majority outcome for three-member panel', () => {
    const input = {
      caseId: 'case-005',
      disputeId: 'dispute-005',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    const payload = compiler.compilePayload(input);

    expect(payload.outcome).toBe(RulingOutcome.GRANTED);
    expect(payload.decisionPolicy).toBe(DecisionPolicy.MAJORITY);
    expect(payload.voteCount[RulingOutcome.GRANTED]).toBe(2);
    expect(payload.voteCount[RulingOutcome.DENIED]).toBe(1);
  });

  test('should determine unanimous outcome when all vote same', () => {
    const input = {
      caseId: 'case-006',
      disputeId: 'dispute-006',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.DENIED, rationale: 'No merit', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.DENIED, rationale: 'No merit', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'No merit', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    const payload = compiler.compilePayload(input);

    expect(payload.outcome).toBe(RulingOutcome.DENIED);
    expect(payload.decisionPolicy).toBe(DecisionPolicy.UNANIMOUS);
  });

  test('should map sole arbitrator decision to outcome', () => {
    const input = {
      caseId: 'case-007',
      disputeId: 'dispute-007',
      round: 1,
      tribunalPolicy: TribunalPolicy.SOLE_ARBITRATOR,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.REMANDED, rationale: 'Need more evidence', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    const payload = compiler.compilePayload(input);

    expect(payload.outcome).toBe(RulingOutcome.REMANDED);
    expect(payload.decisionPolicy).toBe(DecisionPolicy.SOLE);
  });
});

describe('SI-014 Reject Noncanonical Ruling Payload', () => {
  let compiler: RulingCompiler;

  beforeEach(() => {
    compiler = new RulingCompiler();
  });

  test('should reject payload missing caseId', () => {
    const input = {
      caseId: '',
      disputeId: 'dispute-001',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: caseId');
  });

  test('should reject payload missing disputeId', () => {
    const input = {
      caseId: 'case-001',
      disputeId: '',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: disputeId');
  });

  test('should reject payload missing round', () => {
    const input = {
      caseId: 'case-001',
      disputeId: 'dispute-001',
      round: -1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: round');
  });

  test('should reject payload missing tribunalPolicy', () => {
    const input = {
      caseId: 'case-001',
      disputeId: 'dispute-001',
      round: 1,
      tribunalPolicy: undefined as any,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: tribunalPolicy');
  });

  test('should reject payload with empty votes', () => {
    const input = {
      caseId: 'case-001',
      disputeId: 'dispute-001',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: votes');
  });

  test('should reject whitespace-only caseId', () => {
    const input = {
      caseId: '   ',
      disputeId: 'dispute-001',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(() => compiler.compilePayload(input)).toThrow('Canonical binding required: caseId');
  });
});

describe('Ruling State Management', () => {
  let compiler: RulingCompiler;

  beforeEach(() => {
    compiler = new RulingCompiler();
  });

  test('should record ruling after compilation', () => {
    const input = {
      caseId: 'case-010',
      disputeId: 'dispute-010',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    const payload = compiler.compilePayload(input);
    const state = compiler.recordRuling(payload, 'proposal-001');

    expect(state.caseId).toBe('case-010');
    expect(state.round).toBe(1);
    expect(state.outcome).toBe(RulingOutcome.GRANTED);
    expect(state.proposalId).toBe('proposal-001');
  });

  test('should reject duplicate ruling for same case and round', () => {
    const input = {
      caseId: 'case-011',
      disputeId: 'dispute-011',
      round: 1,
      tribunalPolicy: TribunalPolicy.THREE_MEMBER,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_2, outcome: RulingOutcome.GRANTED, rationale: 'Valid', votedAt: Date.now() },
        { arbitrator: ARBITRATOR_KEY_3, outcome: RulingOutcome.DENIED, rationale: 'Invalid', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    const payload = compiler.compilePayload(input);
    compiler.recordRuling(payload);

    expect(() => compiler.recordRuling(payload)).toThrow('Ruling already exists');
  });

  test('should check if ruling exists', () => {
    const input = {
      caseId: 'case-012',
      disputeId: 'dispute-012',
      round: 1,
      tribunalPolicy: TribunalPolicy.SOLE_ARBITRATOR,
      votes: [
        { arbitrator: ARBITRATOR_KEY, outcome: RulingOutcome.DENIED, rationale: 'No merit', votedAt: Date.now() },
      ],
      evidenceHashes: [],
    };

    expect(compiler.hasRuling('case-012', 1)).toBe(false);

    const payload = compiler.compilePayload(input);
    compiler.recordRuling(payload);

    expect(compiler.hasRuling('case-012', 1)).toBe(true);
  });
});
