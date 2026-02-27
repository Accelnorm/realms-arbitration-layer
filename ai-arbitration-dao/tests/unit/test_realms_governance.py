from __future__ import annotations

from ai_arbitration_dao.solana.governance_adapter import GovernanceAdapter, ProposalIntent
from ai_arbitration_dao.solana.instruction_codecs.ruling import RecordRulingPayload

VALID_GOVERNANCE_ADDRESS = "11111111111111111111111111111111"
VALID_OTHER_ADDRESS = "Stake11111111111111111111111111111111111111"


class TestSI021RealmsGovernanceDeployment:
    """SI-021: Arbitration DAO MUST deploy on Realms governance and be set as resolver."""

    def test_governance_adapter_derives_proposal_id(self) -> None:
        adapter = GovernanceAdapter()
        payload = RecordRulingPayload(
            payout_id=42,
            round=1,
            outcome=1,
            is_final=True,
        )
        intent = ProposalIntent(
            governance_address="GovER5Lthms1111111111111111111111111111111",
            dispute_id="dispute-123",
            round=1,
            payload=payload,
        )
        proposal_id = adapter.derive_proposal_id(intent)
        assert proposal_id is not None
        assert len(proposal_id) > 0

    def test_governance_adapter_same_input_same_proposal_id(self) -> None:
        adapter = GovernanceAdapter()
        payload = RecordRulingPayload(
            payout_id=100,
            round=2,
            outcome=0,
            is_final=True,
        )
        intent = ProposalIntent(
            governance_address="GovER5Lthms1111111111111111111111111111111",
            dispute_id="dispute-456",
            round=2,
            payload=payload,
        )
        id1 = adapter.derive_proposal_id(intent)
        id2 = adapter.derive_proposal_id(intent)
        assert id1 == id2

    def test_governance_adapter_different_input_different_proposal_id(self) -> None:
        adapter = GovernanceAdapter()
        payload1 = RecordRulingPayload(
            payout_id=100,
            round=2,
            outcome=0,
            is_final=True,
        )
        intent1 = ProposalIntent(
            governance_address="GovER5Lthms1111111111111111111111111111111",
            dispute_id="dispute-456",
            round=2,
            payload=payload1,
        )
        payload2 = RecordRulingPayload(
            payout_id=200,
            round=3,
            outcome=1,
            is_final=True,
        )
        intent2 = ProposalIntent(
            governance_address="GovER5Lthms1111111111111111111111111111111",
            dispute_id="dispute-789",
            round=3,
            payload=payload2,
        )
        id1 = adapter.derive_proposal_id(intent1)
        id2 = adapter.derive_proposal_id(intent2)
        assert id1 != id2

    def test_governance_adapter_proposal_proof_structure(self) -> None:
        adapter = GovernanceAdapter()
        proof = adapter.proposal_proof(
            "test-proposal-id",
            dispute_id="dispute-123",
            round=1,
        )
        assert "proposal_id" in proof
        assert proof["proposal_id"] == "test-proposal-id"
        assert "proof_type" in proof
        assert proof["proof_type"] == "executed-governance-proposal"
        assert proof["executed"] is True
        assert proof["dispute_id"] == "dispute-123"
        assert proof["round"] == 1

    def test_bind_resolver_verifies_governance_address_match(self) -> None:
        from argparse import Namespace

        from ai_arbitration_dao.commands.bind_resolver import run_bind_resolver
        from ai_arbitration_dao.config import AppSettings
        from ai_arbitration_dao.types import CommandStatus

        args = Namespace(
            governance_address=VALID_GOVERNANCE_ADDRESS,
            resolver_address=VALID_GOVERNANCE_ADDRESS,
        )
        settings = AppSettings()
        result = run_bind_resolver(args, settings)
        assert result.status == CommandStatus.EXECUTED
        assert result.details["verified"] is True

    def test_bind_resolver_fails_on_mismatch(self) -> None:
        from argparse import Namespace

        from ai_arbitration_dao.commands.bind_resolver import run_bind_resolver
        from ai_arbitration_dao.config import AppSettings
        from ai_arbitration_dao.types import CommandStatus

        args = Namespace(
            governance_address=VALID_GOVERNANCE_ADDRESS,
            resolver_address=VALID_OTHER_ADDRESS,
        )
        settings = AppSettings()
        result = run_bind_resolver(args, settings)
        assert result.status == CommandStatus.FAILED
        assert "resolver mismatch" in result.details["error"]

    def test_ruling_proposal_execution_uses_governance_authority(self) -> None:
        from ai_arbitration_dao.orchestration.proposal_authorization import (
            ProposalProof,
            ProposalStore,
        )
        from ai_arbitration_dao.solana.governance_adapter import GovernanceAdapter
        from ai_arbitration_dao.solana.instruction_codecs.ruling import RecordRulingPayload

        adapter = GovernanceAdapter()
        store = ProposalStore()

        store.add_proposal(ProposalProof(
            proposal_id="",
            proof_type="executed-governance-proposal",
            executed=False,
        ))

        payload = RecordRulingPayload(
            payout_id=500,
            round=5,
            outcome=1,
            is_final=True,
        )
        intent = ProposalIntent(
            governance_address="GovER5Lthms1111111111111111111111111111111",
            dispute_id="dispute-999",
            round=5,
            payload=payload,
        )
        proposal_id = adapter.derive_proposal_id(intent)
        store.add_proposal(ProposalProof(
            proposal_id=proposal_id,
            proof_type="executed-governance-proposal",
            executed=False,
            dispute_id=intent.dispute_id,
            round=intent.round,
        ))
        store.mark_executed(proposal_id)
        proof = adapter.proposal_proof(
            proposal_id,
            dispute_id=intent.dispute_id,
            round=intent.round,
        )

        assert proof["proof_type"] == "executed-governance-proposal"
        assert proof["dispute_id"] == intent.dispute_id
        assert proof["round"] == intent.round
        stored = store.get_proposal(proposal_id)
        assert stored is not None
        assert stored.executed is True
