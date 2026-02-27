from ai_arbitration_dao.orchestration.round_safety import (
    RoundSafetyStore,
    check_round_safety,
)
from ai_arbitration_dao.types import CommandStatus


def test_duplicate_round_write_rejected() -> None:
    store = RoundSafetyStore()
    store.record_ruling("dispute-1", 0, "hash123")

    status, error = check_round_safety(store, "dispute-1", 0)

    assert status == CommandStatus.ALREADY_RULED
    assert "duplicate" in str(error).lower()


def test_first_round_write_allowed() -> None:
    store = RoundSafetyStore()

    status, error = check_round_safety(store, "dispute-1", 0)

    assert status == CommandStatus.PENDING
    assert error is None


def test_round_mismatch_rejected() -> None:
    store = RoundSafetyStore()

    status, error = check_round_safety(store, "dispute-1", 0, payload_round=1)

    assert status == CommandStatus.FAILED
    assert "round mismatch" in str(error).lower()


def test_record_ruling_returns_false_for_duplicate() -> None:
    store = RoundSafetyStore()
    result = store.record_ruling("dispute-1", 0, "hash123")
    assert result is True

    result = store.record_ruling("dispute-1", 0, "hash456")
    assert result is False


def test_different_dispute_round_allowed() -> None:
    store = RoundSafetyStore()
    store.record_ruling("dispute-1", 0, "hash123")

    status, error = check_round_safety(store, "dispute-1", 1)

    assert status == CommandStatus.PENDING
    assert error is None
