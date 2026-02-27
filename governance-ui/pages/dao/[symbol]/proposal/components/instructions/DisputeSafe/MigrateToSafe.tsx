import { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'
import { serializeInstructionToBase64 } from '@solana/spl-governance'
import { Governance, ProgramAccount } from '@solana/spl-governance'
import { isFormValid, validatePubkey } from '@utils/formValidation'
import { UiInstruction } from '@utils/uiTypes/proposalCreationTypes'
import { AssetAccount } from '@utils/uiTypes/assets'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import InstructionForm, { InstructionInput } from '../FormCreator'
import { InstructionInputType } from '../inputInstructionType'
import { NewProposalContext } from '../../../new'
import { DisputeSafeClient } from '@utils/instructions/DisputeSafe/client'

// On-chain floors (matching program errors 6000 and 6001)
const MIN_DISPUTE_WINDOW_SECONDS = 3600
const MIN_CHALLENGE_BOND_LAMPORTS = 10_000_000

interface MigrateToSafeForm {
  governedAccount: AssetAccount | null
  resolver: string
  disputeWindowSeconds: string
  challengeBondLamports: string
  eligibilityMint: string
  minTokenBalance: string
  maxAppealRounds: string
  appealWindowSeconds: string
  ipfsPolicyHash: string
  treasuryModeEnabled: boolean
  payoutCancellationAllowed: boolean
}

const MigrateToSafe = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<MigrateToSafeForm>({
    governedAccount: null,
    resolver: '',
    disputeWindowSeconds: String(MIN_DISPUTE_WINDOW_SECONDS),
    challengeBondLamports: String(MIN_CHALLENGE_BOND_LAMPORTS),
    eligibilityMint: '',
    minTokenBalance: '1',
    maxAppealRounds: '2',
    appealWindowSeconds: '3600',
    ipfsPolicyHash: '',
    treasuryModeEnabled: false,
    payoutCancellationAllowed: false,
  })
  const [formErrors, setFormErrors] = useState({})

  const schema = yup.object().shape({
    governedAccount: yup.object().nullable().required('Governed account is required'),
    resolver: yup
      .string()
      .required('Resolver is required')
      .test('is-valid-pubkey', 'Invalid resolver address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    disputeWindowSeconds: yup
      .string()
      .required('Dispute window is required')
      .test(
        'min-dispute-window',
        `Dispute window must be at least ${MIN_DISPUTE_WINDOW_SECONDS} seconds (1 hour)`,
        (val) => Number(val) >= MIN_DISPUTE_WINDOW_SECONDS,
      ),
    challengeBondLamports: yup
      .string()
      .required('Challenge bond is required')
      .test(
        'min-challenge-bond',
        `Challenge bond must be at least ${MIN_CHALLENGE_BOND_LAMPORTS.toLocaleString()} lamports (0.01 SOL)`,
        (val) => Number(val) >= MIN_CHALLENGE_BOND_LAMPORTS,
      ),
    eligibilityMint: yup
      .string()
      .required('Eligibility mint is required')
      .test('is-valid-pubkey', 'Invalid eligibility mint address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    minTokenBalance: yup
      .string()
      .required('Min token balance is required')
      .test('is-positive', 'Must be a positive integer', (val) => {
        const n = Number(val)
        return Number.isInteger(n) && n >= 0
      }),
    maxAppealRounds: yup
      .string()
      .required('Max appeal rounds is required')
      .test('is-valid-u8', 'Must be 0–255', (val) => {
        const n = Number(val)
        return Number.isInteger(n) && n >= 0 && n <= 255
      }),
    appealWindowSeconds: yup
      .string()
      .required('Appeal window is required')
      .test('is-positive', 'Must be a positive integer', (val) => Number(val) > 0),
    ipfsPolicyHash: yup.string().optional(),
  })

  const validateInstruction = async (): Promise<boolean> => {
    const { isValid, validationErrors } = await isFormValid(schema, form)
    setFormErrors(validationErrors)
    return isValid
  }

  async function getInstruction(): Promise<UiInstruction> {
    const isValid = await validateInstruction()

    if (!isValid || !form.governedAccount?.governance?.account) {
      return {
        serializedInstruction: '',
        isValid,
        governance: form.governedAccount?.governance,
        chunkBy: 1,
      }
    }

    // The governance PDA is both the signer (authority) and the SafePolicy PDA seed.
    const authority = form.governedAccount.governance.pubkey

    const resolver = new PublicKey(form.resolver)
    const disputeWindow = new BN(form.disputeWindowSeconds)
    const challengeBond = new BN(form.challengeBondLamports)
    const eligibilityMint = new PublicKey(form.eligibilityMint)
    const minTokenBalance = new BN(form.minTokenBalance)
    const maxAppealRounds = Number(form.maxAppealRounds)
    const appealWindowDuration = new BN(form.appealWindowSeconds)

    // ipfs_policy_hash: 32 bytes. Accept 64-char hex or leave zeroed.
    const ipfsPolicyHash = new Uint8Array(32)
    const trimmedHash = form.ipfsPolicyHash.trim()
    if (trimmedHash.length === 64) {
      new Uint8Array(Buffer.from(trimmedHash, 'hex')).forEach((b, i) => {
        ipfsPolicyHash[i] = b
      })
    }

    const instruction = DisputeSafeClient.initializeSafe({
      authority,
      resolver,
      disputeWindow,
      challengeBond,
      eligibilityMint,
      minTokenBalance,
      maxAppealRounds,
      appealWindowDuration,
      ipfsPolicyHash,
      treasuryModeEnabled: form.treasuryModeEnabled,
      payoutCancellationAllowed: form.payoutCancellationAllowed,
    })

    return {
      serializedInstruction: serializeInstructionToBase64(instruction),
      isValid,
      governance: form.governedAccount.governance,
      chunkBy: 1,
    }
  }

  useEffect(() => {
    handleSetInstructions(
      { governedAccount: form.governedAccount?.governance, getInstruction },
      index,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const inputs: InstructionInput[] = [
    {
      label: 'Governance',
      initialValue: form.governedAccount,
      name: 'governedAccount',
      type: InstructionInputType.GOVERNED_ACCOUNT,
      shouldBeGoverned: shouldBeGoverned as any,
      governance: governance,
      options: assetAccounts,
    },
    {
      label: 'Resolver',
      subtitle: 'Pubkey authorised to record rulings on disputed payouts (e.g. arbitration DAO governance address)',
      initialValue: form.resolver,
      name: 'resolver',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Resolver public key',
    },
    {
      label: 'Dispute window (seconds)',
      subtitle: `Minimum ${MIN_DISPUTE_WINDOW_SECONDS.toLocaleString()} s (1 hour)`,
      initialValue: form.disputeWindowSeconds,
      name: 'disputeWindowSeconds',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: MIN_DISPUTE_WINDOW_SECONDS,
      step: 1,
    },
    {
      label: 'Challenge bond (lamports)',
      subtitle: `Minimum ${MIN_CHALLENGE_BOND_LAMPORTS.toLocaleString()} lamports (0.01 SOL)`,
      initialValue: form.challengeBondLamports,
      name: 'challengeBondLamports',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: MIN_CHALLENGE_BOND_LAMPORTS,
      step: 1,
    },
    {
      label: 'Eligibility mint',
      subtitle: 'Token mint challengers must hold. Use SystemProgram ID (111...1) to disable eligibility check.',
      initialValue: form.eligibilityMint,
      name: 'eligibilityMint',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Token mint public key',
    },
    {
      label: 'Min token balance',
      subtitle: 'Minimum tokens required to challenge a payout',
      initialValue: form.minTokenBalance,
      name: 'minTokenBalance',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      step: 1,
    },
    {
      label: 'Max appeal rounds',
      subtitle: '0–255. After this many rounds the ruling is final.',
      initialValue: form.maxAppealRounds,
      name: 'maxAppealRounds',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      max: 255,
      step: 1,
    },
    {
      label: 'Appeal window (seconds)',
      initialValue: form.appealWindowSeconds,
      name: 'appealWindowSeconds',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 1,
      step: 1,
    },
    {
      label: 'IPFS policy hash (optional)',
      subtitle: '64-character hex SHA-256 of the off-chain policy document. Leave blank to omit.',
      initialValue: form.ipfsPolicyHash,
      name: 'ipfsPolicyHash',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: '64-char hex string',
    },
    {
      label: 'Treasury mode enabled',
      subtitle: 'Enable treasury-registry integration',
      initialValue: form.treasuryModeEnabled,
      name: 'treasuryModeEnabled',
      type: InstructionInputType.SWITCH,
    },
    {
      label: 'Payout cancellation allowed',
      subtitle: 'Allow the authority to cancel queued payouts',
      initialValue: form.payoutCancellationAllowed,
      name: 'payoutCancellationAllowed',
      type: InstructionInputType.SWITCH,
    },
  ]

  return (
    <>
      {form && (
        <InstructionForm
          outerForm={form}
          setForm={setForm}
          inputs={inputs}
          setFormErrors={setFormErrors}
          formErrors={formErrors}
        />
      )}
    </>
  )
}

export default MigrateToSafe
