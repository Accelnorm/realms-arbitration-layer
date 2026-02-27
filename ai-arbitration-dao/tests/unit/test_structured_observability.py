"""Tests for SI-017: Structured Observability."""
import pytest

from ai_arbitration_dao.observability.logging import configure_logging, get_logger


def test_structured_logging_includes_dispute_id_key(capsys: pytest.CaptureFixture[str]) -> None:
    """Logs MUST be keyed by dispute id."""
    configure_logging("DEBUG")
    logger = get_logger("test")
    
    logger.info(
        "dispute_processed",
        dispute_id="dispute_123",
        round=1,
        proposal_id="proposal_456",
    )
    
    captured = capsys.readouterr()
    assert "dispute_id" in captured.out
    assert "dispute_123" in captured.out


def test_structured_logging_includes_round_key(capsys: pytest.CaptureFixture[str]) -> None:
    """Logs MUST be keyed by round."""
    configure_logging("DEBUG")
    logger = get_logger("test")
    
    logger.info(
        "dispute_processed",
        dispute_id="dispute_123",
        round=1,
        proposal_id="proposal_456",
    )
    
    captured = capsys.readouterr()
    assert '"round":1' in captured.out or '"round": 1' in captured.out


def test_structured_logging_includes_proposal_id_key(capsys: pytest.CaptureFixture[str]) -> None:
    """Logs MUST be keyed by proposal id."""
    configure_logging("DEBUG")
    logger = get_logger("test")
    
    logger.info(
        "dispute_processed",
        dispute_id="dispute_123",
        round=1,
        proposal_id="proposal_456",
    )
    
    captured = capsys.readouterr()
    assert "proposal_id" in captured.out
    assert "proposal_456" in captured.out


def test_structured_logging_outputs_json(capsys: pytest.CaptureFixture[str]) -> None:
    """Operational logs MUST be structured JSON."""
    configure_logging("DEBUG")
    logger = get_logger("test")
    
    logger.info("test_event", key="value")
    
    captured = capsys.readouterr()
    assert "{" in captured.out
    assert "}" in captured.out
    assert "test_event" in captured.out
