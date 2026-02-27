from __future__ import annotations

from dataclasses import dataclass

from ai_arbitration_dao.types import CommandStatus


@dataclass
class RoundState:
    status: CommandStatus
    ruling_hash: str | None = None


class RoundSafetyStore:
    def __init__(self) -> None:
        self._rounds: dict[str, RoundState] = {}

    def _make_key(self, dispute_id: str, round: int) -> str:
        return f"{dispute_id}:{round}"

    def has_ruling(self, dispute_id: str, round: int) -> bool:
        key = self._make_key(dispute_id, round)
        state = self._rounds.get(key)
        if state is None:
            return False
        return state.status in {
            CommandStatus.EXECUTED,
            CommandStatus.ALREADY_RULED,
        }

    def record_ruling(self, dispute_id: str, round: int, ruling_hash: str) -> bool:
        if self.has_ruling(dispute_id, round):
            return False
        key = self._make_key(dispute_id, round)
        self._rounds[key] = RoundState(status=CommandStatus.EXECUTED, ruling_hash=ruling_hash)
        return True

    def get_status(self, dispute_id: str, round: int) -> CommandStatus:
        key = self._make_key(dispute_id, round)
        state = self._rounds.get(key)
        if state is None:
            return CommandStatus.PENDING
        return state.status


def check_round_safety(
    store: RoundSafetyStore,
    dispute_id: str,
    round: int,
    payload_round: int | None = None,
) -> tuple[CommandStatus, str | None]:
    if store.has_ruling(dispute_id, round):
        return CommandStatus.ALREADY_RULED, "duplicate round write rejected"

    if payload_round is not None and payload_round != round:
        return (
            CommandStatus.FAILED,
            f"round mismatch: payload round {payload_round} != active round {round}",
        )

    return CommandStatus.PENDING, None
