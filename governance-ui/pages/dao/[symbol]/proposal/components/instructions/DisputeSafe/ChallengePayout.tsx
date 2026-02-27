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

const CHALLENGE_PAYOUT_DISCRIMINATOR = Buffer.from([
  128, 122, 229, 7, 139, 210, 241, 49,
])

interface ChallengePayoutForm {
  governedAccount: AssetAccount | null
  safe: string
  payoutIndex: string
  safePolicyAuthority: string
  challengerTokenAccount: string
  bondAmountLamports: string
}

function serializeChallengePayoutArgs(bondAmount: BN): Buffer {
  return bondAmount.toArrayLike(Buffer, 'le', 8)
}

const ChallengePayout = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<ChallengePayoutForm>({
    governedAccount: null,
    safe: '',
    payoutIndex: '',
    safePolicyAuthority: '',
    challengerTokenAccount: '',
    bondAmountLamports: '',
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
    challengerTokenAccount: yup
      .string()
      .required('Challenger token account is required')
      .test('is-valid-pubkey', 'Invalid challenger token account', (val) =>
        val ? validatePubkey(val) : true,
      ),
    bondAmountLamports: yup
      .string()
      .required('Bond amount is required')
      .test('is-positive', 'Bond amount must be a positive integer', (val) => {
        if (!val) return false
        const n = Number(val)
        return Number.isInteger(n) && n > 0
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
    const challengerTokenAccount = new PublicKey(form.challengerTokenAccount)
    const bondAmount = new BN(form.bondAmountLamports)

    const [payoutPda] = findPayoutPda(safe, payoutIndex)
    const [challengePda] = findChallengePda(payoutPda)
    const [safePolicyPda] = findSafePolicyPda(safePolicyAuthority)
    const [challengeBondVaultPda] = findChallengeBondVaultPda()
    const challenger = form.governedAccount.governance.pubkey

    const argsData = serializeChallengePayoutArgs(bondAmount)
    const data = Buffer.from([
      ...CHALLENGE_PAYOUT_DISCRIMINATOR,
      ...argsData,
    ])

    const instruction = new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payoutPda, isSigner: false, isWritable: true },
        { pubkey: challengePda, isSigner: false, isWritable: true },
        { pubkey: safePolicyPda, isSigner: false, isWritable: true },
        { pubkey: safe, isSigner: false, isWritable: true },
        { pubkey: challengeBondVaultPda, isSigner: false, isWritable: true },
        { pubkey: challengerTokenAccount, isSigner: false, isWritable: false },
        { pubkey: challenger, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    })

    return {
      serializedInstruction: serializeInstructionToBase64(instruction),
      prerequisiteInstructions: [],
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
      subtitle: 'Safe public key used as payout PDA seed',
      initialValue: form.safe,
      name: 'safe',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe public key',
    },
    {
      label: 'Payout index',
      subtitle: 'u64 index used in payout PDA derivation',
      initialValue: form.payoutIndex,
      name: 'payoutIndex',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 0,
      step: 1,
    },
    {
      label: 'Safe policy authority',
      subtitle: 'Authority pubkey used to derive safe_policy PDA',
      initialValue: form.safePolicyAuthority,
      name: 'safePolicyAuthority',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe policy authority public key',
    },
    {
      label: 'Challenger token account',
      subtitle: 'Token account holding eligibility mint for challenge checks',
      initialValue: form.challengerTokenAccount,
      name: 'challengerTokenAccount',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Challenger token account public key',
    },
    {
      label: 'Bond amount (lamports)',
      subtitle: 'Must match policy challenge bond on-chain',
      initialValue: form.bondAmountLamports,
      name: 'bondAmountLamports',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 1,
      step: 1,
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

export default ChallengePayout
