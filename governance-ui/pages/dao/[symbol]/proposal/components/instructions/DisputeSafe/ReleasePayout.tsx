import { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
import BN from 'bn.js'
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'
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
  findNativeVaultPda,
  findPayoutPda,
  findSafePolicyPda,
  findSplVaultPda,
} from '@utils/instructions/DisputeSafe/pdas'

const RELEASE_NATIVE_PAYOUT_DISCRIMINATOR = Buffer.from([
  66, 117, 20, 254, 69, 51, 158, 87,
])
const RELEASE_SPL_PAYOUT_DISCRIMINATOR = Buffer.from([
  203, 147, 38, 39, 247, 105, 86, 226,
])

type ReleaseAssetType = 'Native' | 'Spl'
type SelectValue<T extends string> = T | { name: string; value: T }

interface ReleasePayoutForm {
  governedAccount: AssetAccount | null
  safe: string
  payoutIndex: string
  assetType: SelectValue<ReleaseAssetType>
  recipient: string
  safePolicyAuthority: string
  mint: string
  recipientTokenAccount: string
  tokenProgram: string
}

function readSelectValue<T extends string>(value: SelectValue<T>): T {
  return typeof value === 'string' ? value : value.value
}

const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

const ReleasePayout = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<ReleasePayoutForm>({
    governedAccount: null,
    safe: '',
    payoutIndex: '',
    assetType: 'Native',
    recipient: '',
    safePolicyAuthority: '',
    mint: '',
    recipientTokenAccount: '',
    tokenProgram: SPL_TOKEN_PROGRAM_ID,
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
    recipient: yup
      .string()
      .required('Recipient is required')
      .test('is-valid-pubkey', 'Invalid recipient address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    safePolicyAuthority: yup.string().when('assetType', {
      is: (v: SelectValue<ReleaseAssetType>) => readSelectValue(v) === 'Spl',
      then: (s) =>
        s
          .required('Safe policy authority is required for SPL release')
          .test('is-valid-pubkey', 'Invalid safe policy authority address', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    mint: yup.string().when('assetType', {
      is: (v: SelectValue<ReleaseAssetType>) => readSelectValue(v) === 'Spl',
      then: (s) =>
        s.required('Mint is required for SPL release').test(
          'is-valid-pubkey',
          'Invalid mint address',
          (val) => (val ? validatePubkey(val) : true),
        ),
      otherwise: (s) => s.optional(),
    }),
    recipientTokenAccount: yup.string().when('assetType', {
      is: (v: SelectValue<ReleaseAssetType>) => readSelectValue(v) === 'Spl',
      then: (s) =>
        s
          .required('Recipient token account is required for SPL release')
          .test('is-valid-pubkey', 'Invalid recipient token account', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    tokenProgram: yup.string().when('assetType', {
      is: (v: SelectValue<ReleaseAssetType>) => readSelectValue(v) === 'Spl',
      then: (s) =>
        s
          .required('Token program is required for SPL release')
          .test('is-valid-pubkey', 'Invalid token program id', (val) =>
            val ? validatePubkey(val) : true,
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
    const assetType = readSelectValue(form.assetType)
    const payoutIndex = new BN(form.payoutIndex)
    const recipient = new PublicKey(form.recipient)
    const [payoutPda] = findPayoutPda(safe, payoutIndex)

    if (assetType === 'Native') {
      const [nativeVaultPda] = findNativeVaultPda(safe)
      const instruction = new TransactionInstruction({
        programId: SAFE_TREASURY_PROGRAM_ID,
        keys: [
          { pubkey: payoutPda, isSigner: false, isWritable: true },
          { pubkey: nativeVaultPda, isSigner: false, isWritable: true },
          { pubkey: safe, isSigner: false, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: RELEASE_NATIVE_PAYOUT_DISCRIMINATOR,
      })

      return {
        serializedInstruction: serializeInstructionToBase64(instruction),
        isValid,
        governance: form.governedAccount.governance,
        chunkBy: 1,
      }
    }

    const safePolicyAuthority = new PublicKey(form.safePolicyAuthority)
    const safePolicyPda = findSafePolicyPda(safePolicyAuthority)[0]
    const mint = new PublicKey(form.mint)
    const vaultTokenPda = findSplVaultPda(safePolicyPda, mint)[0]
    const recipientToken = new PublicKey(form.recipientTokenAccount)
    const tokenProgram = new PublicKey(form.tokenProgram)

    const instruction = new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payoutPda, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vaultTokenPda, isSigner: false, isWritable: true },
        { pubkey: safePolicyPda, isSigner: false, isWritable: false },
        { pubkey: safe, isSigner: false, isWritable: true },
        { pubkey: recipientToken, isSigner: false, isWritable: true },
        { pubkey: tokenProgram, isSigner: false, isWritable: false },
      ],
      data: RELEASE_SPL_PAYOUT_DISCRIMINATOR,
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
      label: 'Asset type',
      initialValue: { name: 'Native', value: 'Native' },
      name: 'assetType',
      type: InstructionInputType.SELECT,
      options: [
        { name: 'Native', value: 'Native' },
        { name: 'SPL', value: 'Spl' },
      ],
    },
    {
      label: 'Recipient',
      initialValue: form.recipient,
      name: 'recipient',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder:
        readSelectValue(form.assetType) === 'Native'
          ? 'Recipient wallet public key'
          : 'Recipient wallet (owner of recipient token account)',
    },
    {
      label: 'Safe policy authority',
      initialValue: form.safePolicyAuthority,
      name: 'safePolicyAuthority',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe policy authority public key',
      hide: () => readSelectValue(form.assetType) !== 'Spl',
    },
    {
      label: 'Mint',
      initialValue: form.mint,
      name: 'mint',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Mint public key',
      hide: () => readSelectValue(form.assetType) !== 'Spl',
    },
    {
      label: 'Recipient token account',
      initialValue: form.recipientTokenAccount,
      name: 'recipientTokenAccount',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Recipient token account public key',
      hide: () => readSelectValue(form.assetType) !== 'Spl',
    },
    {
      label: 'Token program',
      initialValue: form.tokenProgram,
      name: 'tokenProgram',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Token program id',
      hide: () => readSelectValue(form.assetType) !== 'Spl',
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

export default ReleasePayout
