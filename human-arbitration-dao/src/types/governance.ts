import { PublicKey } from '@solana/web3.js';

export interface DeploymentManifest {
  daoAddress: PublicKey;
  governanceAuthority: PublicKey;
  realm: PublicKey;
  programId: PublicKey;
  deployedAt: number;
  chainId: string;
}

export interface ResolverBinding {
  resolverIdentity: PublicKey;
  governanceAuthority: PublicKey;
  boundAt: number;
}

export interface CharterPolicy {
  resolver: ResolverBinding;
  version: string;
}
