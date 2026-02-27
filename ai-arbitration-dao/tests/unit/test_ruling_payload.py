import pytest

from ai_arbitration_dao.domain.dispute_snapshot import DisputeSnapshot, RulingOutcome
from ai_arbitration_dao.domain.ruling_payload import compile_ruling_payload


def test_payload_is_deterministic_for_identical_input() -> None:
    snapshot = DisputeSnapshot(
        safe="safe111",
        payout_id=42,
        dispute_id="dispute-abc",
        round=0,
        outcome=RulingOutcome.ALLOW,
    )

    payload_one = compile_ruling_payload(snapshot, is_final=False)
    payload_two = compile_ruling_payload(snapshot, is_final=False)

    assert payload_one.serialized == payload_two.serialized
    assert payload_one.payload_hash == payload_two.payload_hash


def test_payload_rejects_missing_safe_field() -> None:
    snapshot = DisputeSnapshot(
        safe="",
        payout_id=42,
        dispute_id="dispute-abc",
        round=0,
        outcome=RulingOutcome.ALLOW,
    )

    with pytest.raises(ValueError, match="safe is required"):
        compile_ruling_payload(snapshot, is_final=False)


def test_payload_rejects_negative_payout_id() -> None:
    snapshot = DisputeSnapshot(
        safe="safe111",
        payout_id=-1,
        dispute_id="dispute-abc",
        round=0,
        outcome=RulingOutcome.ALLOW,
    )

    with pytest.raises(ValueError, match="payout_id must be non-negative"):
        compile_ruling_payload(snapshot, is_final=False)


def test_payload_rejects_empty_dispute_id() -> None:
    snapshot = DisputeSnapshot(
        safe="safe111",
        payout_id=42,
        dispute_id="",
        round=0,
        outcome=RulingOutcome.ALLOW,
    )

    with pytest.raises(ValueError, match="dispute_id is required"):
        compile_ruling_payload(snapshot, is_final=False)


def test_payload_rejects_negative_round() -> None:
    snapshot = DisputeSnapshot(
        safe="safe111",
        payout_id=42,
        dispute_id="dispute-abc",
        round=-1,
        outcome=RulingOutcome.ALLOW,
    )

    with pytest.raises(ValueError, match="round must be non-negative"):
        compile_ruling_payload(snapshot, is_final=False)
