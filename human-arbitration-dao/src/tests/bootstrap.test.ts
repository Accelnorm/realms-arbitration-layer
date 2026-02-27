import { PublicKey } from '@solana/web3.js';
import { RealmsBootstrap, BootstrapConfig } from '../modules/bootstrap';

const MOCK_CONNECTION = {} as any;

const ADMIN_KEY = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const RESOLVER_KEY = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const CASE_MANAGER_KEY = new PublicKey('CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8');
const EXECUTOR_KEY = new PublicKey('GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq');
const OBSERVER_KEY = new PublicKey('LbUiWL3xVV8hTFYBVdbTNrpDo41NKS6o3LHHuDzjfcY');

describe('SI-001 Realms Institutional Bootstrap', () => {
  let bootstrap: RealmsBootstrap;

  beforeEach(() => {
    bootstrap = new RealmsBootstrap(MOCK_CONNECTION);
  });

  test('should deploy Human Arbitration DAO with deterministic identifiers', async () => {
    const config: BootstrapConfig = {
      realmName: 'HumanArbitrationDAO',
      resolverIdentity: ADMIN_KEY,
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      executors: [EXECUTOR_KEY],
      observers: [OBSERVER_KEY],
    };

    const manifest = await bootstrap.deploy(config);

    expect(manifest.daoAddress).toBeInstanceOf(PublicKey);
    expect(manifest.governanceAuthority).toBeInstanceOf(PublicKey);
    expect(manifest.realm).toBeInstanceOf(PublicKey);
    expect(manifest.programId).toBeInstanceOf(PublicKey);
    expect(manifest.chainId).toBe('mainnet-beta');
    expect(manifest.deployedAt).toBeGreaterThan(0);
  });

  test('should produce deterministic identifiers for same input', async () => {
    const config: BootstrapConfig = {
      realmName: 'TestDAO',
      resolverIdentity: RESOLVER_KEY,
      admin: ADMIN_KEY,
      caseManager: CASE_MANAGER_KEY,
      executors: [],
      observers: [],
    };

    const manifest1 = await bootstrap.deploy(config);
    const manifest2 = await bootstrap.deploy(config);

    expect(manifest1.daoAddress.toBase58()).toBe(manifest2.daoAddress.toBase58());
    expect(manifest1.realm.toBase58()).toBe(manifest2.realm.toBase58());
  });
});

describe('SI-002 Resolver Binding', () => {
  let bootstrap: RealmsBootstrap;

  beforeEach(() => {
    bootstrap = new RealmsBootstrap(MOCK_CONNECTION);
  });

  test('should bind resolver identity to governance authority', async () => {
    const governanceAuthority = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
    const resolverIdentity = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');

    const binding = await bootstrap.bindResolver(governanceAuthority, resolverIdentity);

    expect(binding.resolverIdentity.toBase58()).toBe(resolverIdentity.toBase58());
    expect(binding.governanceAuthority.toBase58()).toBe(governanceAuthority.toBase58());
    expect(binding.boundAt).toBeGreaterThan(0);
  });

  test('should create valid charter policy', async () => {
    const resolverBinding = {
      resolverIdentity: new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR'),
      governanceAuthority: new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi'),
      boundAt: Date.now(),
    };

    const policy = await bootstrap.getCharterPolicy(resolverBinding);

    expect(policy.resolver.resolverIdentity.toBase58()).toBe(resolverBinding.resolverIdentity.toBase58());
    expect(policy.version).toBe('1.0.0');
  });
});
