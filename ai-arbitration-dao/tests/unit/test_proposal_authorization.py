from ai_arbitration_dao.orchestration.proposal_authorization import (
    EXECUTED_GOVERNANCE_PROOF_TYPE,
    ProposalProof,
    ProposalStore,
    authorize_ruling_write,
    parse_proposal_proof,
)
from ai_arbitration_dao.types import CommandStatus


def test_parse_proposal_proof_valid() -> None:
    proof = {
        "proposal_id": "prop-123",
        "proof_type": "executed-governance-proposal",
        "executed": True,
        "dispute_id": "dispute-1",
        "round": 0,
    }
    result = parse_proposal_proof(proof)

    assert result is not None
    assert result.proposal_id == "prop-123"
    assert result.proof_type == "executed-governance-proposal"
    assert result.executed is True
    assert result.dispute_id == "dispute-1"
    assert result.round == 0


def test_parse_proposal_proof_missing_proposal_id() -> None:
    proof = {"proof_type": "executed-governance-proposal", "executed": True}
    result = parse_proposal_proof(proof)

    assert result is None


def test_parse_proposal_proof_rejects_boolean_round() -> None:
    proof = {
        "proposal_id": "prop-123",
        "proof_type": "executed-governance-proposal",
        "executed": True,
        "dispute_id": "dispute-1",
        "round": True,
    }
    result = parse_proposal_proof(proof)

    assert result is None


def test_parse_proposal_proof_empty_proposal_id() -> None:
    proof = {"proposal_id": "", "proof_type": "executed-governance-proposal"}
    result = parse_proposal_proof(proof)

    assert result is None


def test_parse_proposal_proof_rejects_non_boolean_executed() -> None:
    proof = {
        "proposal_id": "prop-123",
        "proof_type": "executed-governance-proposal",
        "executed": "true",
    }
    result = parse_proposal_proof(proof)

    assert result is None


def test_proposal_store_add_and_get() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        dispute_id="dispute-1",
        round=0,
    )

    store.add_proposal(proof)
    result = store.get_proposal("prop-123")

    assert result is not None
    assert result.proposal_id == "prop-123"
    assert result.executed is True


def test_proposal_store_mark_executed() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=False,
    )

    store.add_proposal(proof)
    result = store.mark_executed("prop-123")

    assert result is True
    stored = store.get_proposal("prop-123")
    assert stored is not None
    assert stored.executed is True


def test_proposal_store_mark_executed_not_found() -> None:
    store = ProposalStore()
    result = store.mark_executed("nonexistent")

    assert result is False


def test_authorize_ruling_write_missing_proof() -> None:
    store = ProposalStore()

    status, error = authorize_ruling_write(store, None, "dispute-1", 0)

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "missing" in error.lower()
    assert "proposal" in error.lower()


def test_authorize_ruling_write_invalid_proof() -> None:
    store = ProposalStore()
    proof = {"proof_type": "some-type"}

    status, error = authorize_ruling_write(store, proof, "dispute-1", 0)

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "invalid" in error.lower()


def test_authorize_ruling_write_invalid_proof_type() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="not-governance-proof",
        executed=True,
        dispute_id="dispute-1",
        round=0,
    )
    store.add_proposal(proof)
    store.mark_executed("prop-123")

    status, error = authorize_ruling_write(
        store,
        {
            "proposal_id": "prop-123",
            "proof_type": "not-governance-proof",
            "executed": True,
            "dispute_id": "dispute-1",
            "round": 0,
        },
        "dispute-1",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert EXECUTED_GOVERNANCE_PROOF_TYPE in error


def test_authorize_ruling_write_invalid_target_dispute() -> None:
    store = ProposalStore()
    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True},
        "   ",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "target dispute" in error.lower()


def test_authorize_ruling_write_invalid_target_round() -> None:
    store = ProposalStore()
    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True},
        "dispute-1",
        -1,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "round must be non-negative" in error.lower()


def test_authorize_ruling_write_not_executed() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=False,
        dispute_id="dispute-1",
        round=0,
    )
    store.add_proposal(proof)

    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": False},
        "dispute-1",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "not executed" in error.lower()


def test_authorize_ruling_write_proposal_not_found() -> None:
    store = ProposalStore()
    proof = {"proposal_id": "nonexistent", "executed": True}

    status, error = authorize_ruling_write(store, proof, "dispute-1", 0)

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "not found" in error.lower()


def test_authorize_ruling_write_dispute_mismatch() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        dispute_id="dispute-1",
        round=0,
    )
    store.add_proposal(proof)
    store.mark_executed("prop-123")

    status, error = authorize_ruling_write(
        store,
        {
            "proposal_id": "prop-123",
            "executed": True,
            "dispute_id": "dispute-1",
            "round": 0,
        },
        "dispute-2",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "dispute mismatch" in error.lower()


def test_authorize_ruling_write_round_mismatch() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        dispute_id="dispute-1",
        round=0,
    )
    store.add_proposal(proof)
    store.mark_executed("prop-123")

    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True, "dispute_id": "dispute-1", "round": 0},
        "dispute-1",
        1,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "round mismatch" in error.lower()


def test_authorize_ruling_write_valid_proposal() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        dispute_id="dispute-1",
        round=0,
    )
    store.add_proposal(proof)
    store.mark_executed("prop-123")

    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True, "dispute_id": "dispute-1", "round": 0},
        "dispute-1",
        0,
    )

    assert status == CommandStatus.PENDING
    assert error is None


def test_authorize_ruling_write_rejects_missing_dispute_binding() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        round=0,
    )
    store.add_proposal(proof)

    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True, "round": 0},
        "dispute-1",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "dispute_id is required" in error.lower()


def test_authorize_ruling_write_rejects_missing_round_binding() -> None:
    store = ProposalStore()
    proof = ProposalProof(
        proposal_id="prop-123",
        proof_type="executed-governance-proposal",
        executed=True,
        dispute_id="dispute-1",
    )
    store.add_proposal(proof)

    status, error = authorize_ruling_write(
        store,
        {"proposal_id": "prop-123", "executed": True, "dispute_id": "dispute-1"},
        "dispute-1",
        0,
    )

    assert status == CommandStatus.FAILED
    assert error is not None
    assert "round is required" in error.lower()
