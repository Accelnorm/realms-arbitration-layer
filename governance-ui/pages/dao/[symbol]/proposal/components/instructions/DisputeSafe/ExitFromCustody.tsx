import { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
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
  findSafePolicyPda,
} from '@utils/instructions/DisputeSafe/pdas'

type ExitAssetType = 'Native' | 'Spl' | 'Spl2022'
type SelectValue<T extends string> = T | { name: string; value: T }

const EXIT_CUSTODY_DISCRIMINATOR = Buffer.from([
  234, 163, 1, 157, 45, 41, 60, 173,
])

const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

interface ExitFromCustodyForm {
  governedAccount: AssetAccount | null
  safePolicyAuthority: string
  vault: string
  recipient: string
  assetType: SelectValue<ExitAssetType>
  vaultTokenAccount: string
  recipientTokenAccount: string
  mint: string
  tokenProgram: string
}

function readSelectValue<T extends string>(value: SelectValue<T>): T {
  return typeof value === 'string' ? value : value.value
}

function serializeExitCustodyArgs(
  assetType: ExitAssetType,
  recipient: PublicKey,
): Uint8Array {
  const assetTypeValue =
    assetType === 'Native' ? 0 : assetType === 'Spl' ? 1 : 2
  return Uint8Array.from([assetTypeValue, ...recipient.toBytes()])
}

const ExitFromCustody = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<ExitFromCustodyForm>({
    governedAccount: null,
    safePolicyAuthority: '',
    vault: '',
    recipient: '',
    assetType: 'Native',
    vaultTokenAccount: '',
    recipientTokenAccount: '',
    mint: '',
    tokenProgram: SPL_TOKEN_PROGRAM_ID,
  })
  const [formErrors, setFormErrors] = useState({})

  const schema = yup.object().shape({
    governedAccount: yup.object().nullable().required('Governed account is required'),
    safePolicyAuthority: yup
      .string()
      .required('Safe policy authority is required')
      .test('is-valid-pubkey', 'Invalid safe policy authority address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    vault: yup
      .string()
      .required('Vault is required')
      .test('is-valid-pubkey', 'Invalid vault address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    recipient: yup
      .string()
      .required('Recipient is required')
      .test('is-valid-pubkey', 'Invalid recipient address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    vaultTokenAccount: yup.string().when('assetType', {
      is: (v: SelectValue<ExitAssetType>) => readSelectValue(v) !== 'Native',
      then: (s) =>
        s
          .required('Vault token account is required for token exits')
          .test('is-valid-pubkey', 'Invalid vault token account', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    recipientTokenAccount: yup.string().when('assetType', {
      is: (v: SelectValue<ExitAssetType>) => readSelectValue(v) !== 'Native',
      then: (s) =>
        s
          .required('Recipient token account is required for token exits')
          .test('is-valid-pubkey', 'Invalid recipient token account', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    mint: yup.string().when('assetType', {
      is: (v: SelectValue<ExitAssetType>) => readSelectValue(v) !== 'Native',
      then: (s) =>
        s
          .required('Mint is required for token exits')
          .test('is-valid-pubkey', 'Invalid mint address', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    tokenProgram: yup.string().when('assetType', {
      is: (v: SelectValue<ExitAssetType>) => readSelectValue(v) !== 'Native',
      then: (s) =>
        s
          .required('Token program is required for token exits')
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

    const safePolicyAuthority = new PublicKey(form.safePolicyAuthority)
    const safePolicyPda = findSafePolicyPda(safePolicyAuthority)[0]
    const vault = new PublicKey(form.vault)
    const recipient = new PublicKey(form.recipient)
    const assetType = readSelectValue(form.assetType)

    const accounts = [
      { pubkey: safePolicyPda, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
    ]

    if (assetType === 'Native') {
      accounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: true })
    } else {
      accounts.push({
        pubkey: new PublicKey(form.vaultTokenAccount),
        isSigner: false,
        isWritable: true,
      })
    }

    accounts.push({ pubkey: recipient, isSigner: false, isWritable: true })

    if (assetType === 'Native') {
      accounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: true })
      accounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false })
    } else {
      accounts.push({
        pubkey: new PublicKey(form.recipientTokenAccount),
        isSigner: false,
        isWritable: true,
      })
      accounts.push({ pubkey: new PublicKey(form.mint), isSigner: false, isWritable: false })
    }

    accounts.push({
      pubkey: form.governedAccount.governance.pubkey,
      isSigner: true,
      isWritable: false,
    })

    accounts.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false })

    accounts.push({
      pubkey:
        assetType === 'Native'
          ? SystemProgram.programId
          : new PublicKey(form.tokenProgram),
      isSigner: false,
      isWritable: false,
    })

    const argsData = serializeExitCustodyArgs(assetType, recipient)
    const data = Buffer.from([...EXIT_CUSTODY_DISCRIMINATOR, ...argsData])

    const instruction = new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: accounts,
      data,
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
      label: 'Warning',
      subtitle:
        'Exit custody transfers all custody-held funds for the selected vault path. Review recipient carefully before proposing.',
      initialValue: true,
      name: 'warning',
      type: InstructionInputType.SWITCH,
      hide: true,
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
      label: 'Vault',
      subtitle: 'Native vault PDA or custody token account/vault account to drain',
      initialValue: form.vault,
      name: 'vault',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Vault public key',
    },
    {
      label: 'Asset type',
      initialValue: { name: 'Native', value: 'Native' },
      name: 'assetType',
      type: InstructionInputType.SELECT,
      options: [
        { name: 'Native', value: 'Native' },
        { name: 'SPL', value: 'Spl' },
        { name: 'SPL 2022', value: 'Spl2022' },
      ],
    },
    {
      label: 'Recipient',
      initialValue: form.recipient,
      name: 'recipient',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Recipient wallet public key',
    },
    {
      label: 'Vault token account',
      initialValue: form.vaultTokenAccount,
      name: 'vaultTokenAccount',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Vault token account public key',
      hide: () => readSelectValue(form.assetType) === 'Native',
    },
    {
      label: 'Recipient token account',
      initialValue: form.recipientTokenAccount,
      name: 'recipientTokenAccount',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Recipient token account public key',
      hide: () => readSelectValue(form.assetType) === 'Native',
    },
    {
      label: 'Mint',
      initialValue: form.mint,
      name: 'mint',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Mint public key',
      hide: () => readSelectValue(form.assetType) === 'Native',
    },
    {
      label: 'Token program',
      initialValue: form.tokenProgram,
      name: 'tokenProgram',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Token program public key',
      hide: () => readSelectValue(form.assetType) === 'Native',
    },
  ]

  return (
    <>
      <p className="mb-3 text-xs text-red-400">
        Warning: Exiting custody moves assets out of safe-treasury custody and is intended for controlled treasury migration or emergency operations.
      </p>
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

export default ExitFromCustody
