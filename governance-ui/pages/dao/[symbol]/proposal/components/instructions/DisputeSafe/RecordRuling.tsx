import { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
import BN from 'bn.js'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { serializeInstructionToBase64 } from '@solana/spl-governance'
import { Governance, ProgramAccount } from '@solana/spl-governance'
import { isFormValid, validatePubkey } from '@utils/formValidation'
import { UiInstruction } from '@utils/uiTypes/proposalCreationTypes'
import { AssetAccount } from '@utils/uiTypes/assets'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import InstructionForm, { InstructionInput } from '../FormCreator'
import { InstructionInputType } from '../inputInstructionType'
import { NewProposalContext } from '../../../new'
import {
  SAFE_TREASURY_PROGRAM_ID,
  findChallengeBondVaultPda,
  findChallengePda,
  findPayoutPda,
  findSafePolicyPda,
} from '@utils/instructions/DisputeSafe/pdas'

const RECORD_RULING_DISCRIMINATOR = Buffer.from([
  176, 44, 173, 34, 129, 227, 28, 153,
])

type AuthorizationMode = 'Resolver' | 'Proposal'
type SelectValue<T extends string> = T | { name: string; value: T }

interface RecordRulingForm {
  governedAccount: AssetAccount | null
  safe: string
  payoutIndex: string
  safePolicyAuthority: string
  challenger: string
  resolver: string
  proposal: string
  round: string
  outcome: SelectValue<'Allow' | 'Deny'>
  isFinal: boolean
  authorizationMode: SelectValue<AuthorizationMode>
  payloadHash: string
  proposalState: string
}

function readSelectValue<T extends string>(value: SelectValue<T>): T {
  return typeof value === 'string' ? value : value.value
}

function serializeOptionBytes(value?: Uint8Array): Uint8Array {
  if (!value) {
    return Uint8Array.from([0])
  }
  return Uint8Array.from([1, ...Array.from(value)])
}

function serializeOptionPubkey(value?: PublicKey): Uint8Array {
  return serializeOptionBytes(value ? value.toBytes() : undefined)
}

function serializeOptionU8(value?: number): Uint8Array {
  return serializeOptionBytes(
    typeof value === 'number' ? Uint8Array.from([value]) : undefined,
  )
}

function serializeRecordRulingArgs(args: {
  round: number
  outcome: number
  isFinal: boolean
  authorizationMode: number
  payloadHash?: Uint8Array
  proposalState?: number
}): Uint8Array {
  const chunks: Uint8Array[] = [
    Uint8Array.from([args.round]),
    Uint8Array.from([args.outcome]),
    Uint8Array.from([args.isFinal ? 1 : 0]),
    Uint8Array.from([args.authorizationMode]),
    serializeOptionBytes(args.payloadHash),
    serializeOptionPubkey(undefined),
    serializeOptionPubkey(undefined),
    serializeOptionU8(args.proposalState),
  ]

  return Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk)))
}

const RecordRuling = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<RecordRulingForm>({
    governedAccount: null,
    safe: '',
    payoutIndex: '',
    safePolicyAuthority: '',
    challenger: '',
    resolver: '',
    proposal: '',
    round: '0',
    outcome: 'Allow',
    isFinal: false,
    authorizationMode: 'Proposal',
    payloadHash: '',
    proposalState: '',
  })
  const [formErrors, setFormErrors] = useState({})

  const schema = yup.object().shape({
    governedAccount: yup.object().nullable().required('Governed account is required'),
    safe: yup
      .string()
      .required('Safe is required')
      .test('is-valid-pubkey', 'Invalid safe address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    payoutIndex: yup
      .string()
      .required('Payout index is required')
      .test('is-u64', 'Payout index must be a non-negative integer', (val) => {
        if (!val) return false
        const n = Number(val)
        return Number.isInteger(n) && n >= 0
      }),
    safePolicyAuthority: yup
      .string()
      .required('Safe policy authority is required')
      .test('is-valid-pubkey', 'Invalid safe policy authority address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    challenger: yup
      .string()
      .required('Challenger is required')
      .test('is-valid-pubkey', 'Invalid challenger address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    resolver: yup
      .string()
      .required('Resolver is required')
      .test('is-valid-pubkey', 'Invalid resolver address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    round: yup
      .string()
      .required('Round is required')
      .test('is-u8', 'Round must be 0-255', (val) => {
        const n = Number(val)
        return Number.isInteger(n) && n >= 0 && n <= 255
      }),
    payloadHash: yup.string().when('authorizationMode', {
      is: (v: SelectValue<AuthorizationMode>) => readSelectValue(v) === 'Proposal',
      then: (s) =>
        s
          .required('Payload hash is required in proposal mode')
          .test('is-hex32', 'Payload hash must be 64-char hex', (val) =>
            !!val && /^[0-9a-fA-F]{64}$/.test(val),
          ),
      otherwise: (s) => s.optional(),
    }),
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

    const safe = new PublicKey(form.safe)
    const payoutIndex = new BN(form.payoutIndex)
    const safePolicyAuthority = new PublicKey(form.safePolicyAuthority)
    const challenger = new PublicKey(form.challenger)
    const resolver = new PublicKey(form.resolver)
    const proposal = form.proposal
      ? new PublicKey(form.proposal)
      : SystemProgram.programId

    const [payoutPda] = findPayoutPda(safe, payoutIndex)
    const [challengePda] = findChallengePda(payoutPda)
    const [safePolicyPda] = findSafePolicyPda(safePolicyAuthority)
    const [challengeBondVaultPda] = findChallengeBondVaultPda()

    const authorizationModeValue = readSelectValue(form.authorizationMode)
    const outcomeValue = readSelectValue(form.outcome)
    const authorizationMode = authorizationModeValue === 'Resolver' ? 0 : 1
    const payloadHash =
      authorizationModeValue === 'Proposal'
        ? Uint8Array.from(Buffer.from(form.payloadHash.trim(), 'hex'))
        : undefined
    const proposalState =
      authorizationModeValue === 'Proposal' && form.proposalState !== ''
        ? Number(form.proposalState)
        : undefined

    const argsData = serializeRecordRulingArgs({
      round: Number(form.round),
      outcome: outcomeValue === 'Allow' ? 0 : 1,
      isFinal: form.isFinal,
      authorizationMode,
      payloadHash,
      proposalState,
    })

    const instruction = new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payoutPda, isSigner: false, isWritable: true },
        { pubkey: challengePda, isSigner: false, isWritable: true },
        { pubkey: safePolicyPda, isSigner: false, isWritable: false },
        { pubkey: challengeBondVaultPda, isSigner: false, isWritable: true },
        { pubkey: challenger, isSigner: false, isWritable: true },
        { pubkey: safe, isSigner: false, isWritable: true },
        { pubkey: resolver, isSigner: false, isWritable: false },
        { pubkey: proposal, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        ...RECORD_RULING_DISCRIMINATOR,
        ...argsData,
      ]),
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
      label: 'Safe',
      initialValue: form.safe,
      name: 'safe',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe public key',
    },
    {
      label: 'Payout index',
      initialValue: form.payoutIndex,
      name: 'payoutIndex',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      step: 1,
    },
    {
      label: 'Safe policy authority',
      initialValue: form.safePolicyAuthority,
      name: 'safePolicyAuthority',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe policy authority public key',
    },
    {
      label: 'Challenger',
      initialValue: form.challenger,
      name: 'challenger',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Challenge.challenger public key',
    },
    {
      label: 'Resolver',
      initialValue: form.resolver,
      name: 'resolver',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Resolver public key',
    },
    {
      label: 'Authorization mode',
      initialValue: { name: 'Proposal', value: 'Proposal' },
      name: 'authorizationMode',
      type: InstructionInputType.SELECT,
      options: [
        { name: 'Proposal', value: 'Proposal' },
        { name: 'Resolver', value: 'Resolver' },
      ],
    },
    {
      label: 'Proposal proof account (optional)',
      initialValue: form.proposal,
      name: 'proposal',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Governance proposal account public key',
      hide: () => readSelectValue(form.authorizationMode) !== 'Proposal',
    },
    {
      label: 'Payload hash (hex)',
      initialValue: form.payloadHash,
      name: 'payloadHash',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: '64-char hex payload hash',
      hide: () => readSelectValue(form.authorizationMode) !== 'Proposal',
    },
    {
      label: 'Proposal state (optional u8)',
      initialValue: form.proposalState,
      name: 'proposalState',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      max: 255,
      step: 1,
      hide: () => readSelectValue(form.authorizationMode) !== 'Proposal',
    },
    {
      label: 'Round',
      initialValue: form.round,
      name: 'round',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      max: 255,
      step: 1,
    },
    {
      label: 'Outcome',
      initialValue: { name: 'Allow', value: 'Allow' },
      name: 'outcome',
      type: InstructionInputType.SELECT,
      options: [
        { name: 'Allow', value: 'Allow' },
        { name: 'Deny', value: 'Deny' },
      ],
    },
    {
      label: 'Finalize this ruling',
      initialValue: form.isFinal,
      name: 'isFinal',
      type: InstructionInputType.SWITCH,
    },
  ]

  return (
    <>
      <InstructionForm
        outerForm={form}
        setForm={setForm}
        inputs={inputs}
        setFormErrors={setFormErrors}
        formErrors={formErrors}
      />
    </>
  )
}

export default RecordRuling
