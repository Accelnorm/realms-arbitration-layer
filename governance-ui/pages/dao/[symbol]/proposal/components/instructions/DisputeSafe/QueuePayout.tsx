import { useContext, useEffect, useState } from 'react'
import * as yup from 'yup'
import { sha256 } from '@noble/hashes/sha256'
import BN from 'bn.js'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { serializeInstructionToBase64 } from '@solana/spl-governance'
import { Governance, ProgramAccount } from '@solana/spl-governance'
import { isFormValid, validatePubkey } from '@utils/formValidation'
import { UiInstruction } from '@utils/uiTypes/proposalCreationTypes'
import { AssetAccount } from '@utils/uiTypes/assets'
import useGovernanceAssets from '@hooks/useGovernanceAssets'
import useLegacyConnectionContext from '@hooks/useLegacyConnectionContext'
import InstructionForm, { InstructionInput } from '../FormCreator'
import { InstructionInputType } from '../inputInstructionType'
import { NewProposalContext } from '../../../new'
import {
  SAFE_POLICY_PAYOUT_COUNT_OFFSET,
  findSafePolicyPda,
  findPayoutPda,
} from '@utils/instructions/DisputeSafe/pdas'
import { DisputeSafeClient } from '@utils/instructions/DisputeSafe/client'

type AssetType = 'Native' | 'Spl'

interface QueuePayoutForm {
  governedAccount: AssetAccount | null
  // The safe account pubkey — used as the PDA seed for the Payout account.
  // In a Realms DAO this is typically the native-treasury PDA, which is
  // distinct from the governance PDA (the SafePolicy authority).
  safeAccount: string
  assetType: AssetType
  mint: string
  recipient: string
  amount: string
  metadata: string
}

const QueuePayout = ({
  index,
  governance,
}: {
  index: number
  governance: ProgramAccount<Governance> | null
}) => {
  const { assetAccounts } = useGovernanceAssets()
  const connection = useLegacyConnectionContext()
  const shouldBeGoverned = !!(index !== 0 && governance)
  const { handleSetInstructions } = useContext(NewProposalContext)

  const [form, setForm] = useState<QueuePayoutForm>({
    governedAccount: null,
    safeAccount: '',
    assetType: 'Native',
    mint: '',
    recipient: '',
    amount: '',
    metadata: '',
  })
  const [formErrors, setFormErrors] = useState({})

  const schema = yup.object().shape({
    governedAccount: yup
      .object()
      .nullable()
      .required('Governed account is required'),
    safeAccount: yup
      .string()
      .required('Safe account is required')
      .test('is-valid-pubkey', 'Invalid safe account address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    recipient: yup
      .string()
      .required('Recipient is required')
      .test('is-valid-pubkey', 'Invalid recipient address', (val) =>
        val ? validatePubkey(val) : true,
      ),
    amount: yup
      .string()
      .required('Amount is required')
      .test('is-positive', 'Amount must be a positive integer', (val) => {
        if (!val) return false
        const n = Number(val)
        return Number.isInteger(n) && n > 0
      }),
    mint: yup.string().when('assetType', {
      is: 'Spl',
      then: (s) =>
        s
          .required('Mint is required for SPL payouts')
          .test('is-valid-pubkey', 'Invalid mint address', (val) =>
            val ? validatePubkey(val) : true,
          ),
      otherwise: (s) => s.optional(),
    }),
    metadata: yup.string().optional(),
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

    // Governance PDA = SafePolicy authority, payer, and authorization signer.
    const governancePubkey = form.governedAccount.governance.pubkey
    const safe = new PublicKey(form.safeAccount)
    const recipient = new PublicKey(form.recipient)
    const amount = new BN(form.amount)
    // For native assets mint must be None (undefined). For SPL pass the mint pubkey.
    const mint = form.assetType === 'Spl' ? new PublicKey(form.mint) : undefined

    // Hash the metadata description → metadata_hash.
    // Leave undefined (→ None on-chain) when the field is empty.
    const metadataRaw = form.metadata.trim()
    const metadataHash = metadataRaw.length > 0
      ? sha256(new TextEncoder().encode(metadataRaw))
      : undefined

    // Derive SafePolicy PDA using the governance PDA as authority, then read
    // the current payout_count to derive the next Payout PDA deterministically.
    const [safePolicyPda] = findSafePolicyPda(governancePubkey)
    const safePolicyInfo = await connection.current.getAccountInfo(safePolicyPda)
    if (!safePolicyInfo) {
      return {
        serializedInstruction: '',
        isValid: false,
        governance: form.governedAccount.governance,
        chunkBy: 1,
      }
    }

    const payoutCount = new BN(
      safePolicyInfo.data.slice(
        SAFE_POLICY_PAYOUT_COUNT_OFFSET,
        SAFE_POLICY_PAYOUT_COUNT_OFFSET + 8,
      ),
      'le',
    )
    const [payoutPda] = findPayoutPda(safe, payoutCount)

    // Build the instruction via DisputeSafeClient so that account ordering
    // and Borsh Option<> encoding are guaranteed to match the program.
    const instruction = DisputeSafeClient.queuePayout({
      safe,
      safePolicyAuthority: governancePubkey,
      payoutIndex: payoutCount,
      payer: governancePubkey,
      authority: governancePubkey,
      assetType: form.assetType,
      mint,
      recipient,
      amount,
      metadataHash,
      authorizationMode: 0, // authority.is_signer mode
      proposal: SystemProgram.programId, // unused in mode 0
    })

    // Sanity-check: the payout PDA in the client-built instruction should match.
    const clientPayoutKey = instruction.keys[0].pubkey
    if (!clientPayoutKey.equals(payoutPda)) {
      // Should never happen; both use the same findPayoutPda logic.
      return {
        serializedInstruction: '',
        isValid: false,
        governance: form.governedAccount.governance,
        chunkBy: 1,
      }
    }

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
      label: 'Safe account',
      subtitle: 'The safe pubkey used as the Payout PDA seed (typically the native-treasury address)',
      initialValue: form.safeAccount,
      name: 'safeAccount',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Safe account public key',
    },
    {
      label: 'Asset Type',
      initialValue: form.assetType,
      name: 'assetType',
      type: InstructionInputType.SELECT,
      options: [
        { name: 'Native (SOL)', value: 'Native' },
        { name: 'SPL Token', value: 'Spl' },
      ],
    },
    {
      label: 'Mint',
      initialValue: form.mint,
      name: 'mint',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Token mint address',
      hide: () => form.assetType !== 'Spl',
    },
    {
      label: 'Recipient',
      initialValue: form.recipient,
      name: 'recipient',
      type: InstructionInputType.INPUT,
      inputType: 'text',
      placeholder: 'Recipient wallet address',
    },
    {
      label: 'Amount (lamports / smallest token unit)',
      initialValue: form.amount,
      name: 'amount',
      type: InstructionInputType.INPUT,
      inputType: 'number',
      min: 1,
      step: 1,
    },
    {
      label: 'Metadata description (optional)',
      subtitle: 'SHA-256 hashed on-chain as the payout metadata_hash. Leave blank to omit.',
      initialValue: form.metadata,
      name: 'metadata',
      type: InstructionInputType.TEXTAREA,
      placeholder: 'Purpose or description of this payout',
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

export default QueuePayout
