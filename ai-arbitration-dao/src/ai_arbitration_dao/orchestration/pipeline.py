from __future__ import annotations

from dataclasses import dataclass

from ai_arbitration_dao.domain.dispute_snapshot import DisputeSnapshot
from ai_arbitration_dao.domain.ruling_payload import RulingPayload, compile_ruling_payload
from ai_arbitration_dao.types import CommandStatus


@dataclass(slots=True, frozen=True)
class PipelineState:
    dispute_id: str
    round: int
    status: CommandStatus
    payload: RulingPayload


def run_deterministic_pipeline(snapshot: DisputeSnapshot, *, is_final: bool) -> PipelineState:
    payload = compile_ruling_payload(snapshot, is_final=is_final)
    return PipelineState(
        dispute_id=snapshot.dispute_id,
        round=snapshot.round,
        status=CommandStatus.PENDING,
        payload=payload,
    )
