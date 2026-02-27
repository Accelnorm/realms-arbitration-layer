from __future__ import annotations

from dataclasses import dataclass

from ai_arbitration_dao.solana.instruction_codecs.ruling import RecordRulingPayload


@dataclass(slots=True, frozen=True)
class SafeTreasuryRulingRequest:
    safe: str
    payout_id: int
    dispute_id: str
    round: int
    outcome: int
    is_final: bool


class SafeTreasuryAdapter:
    """Adapter boundary for safe-treasury interactions.

    This scaffold keeps behavior deterministic and side-effect free by returning
    structured payload contracts that can be attached to proposal transactions.
    """

    def compile_record_ruling_payload(
        self,
        request: SafeTreasuryRulingRequest,
    ) -> RecordRulingPayload:
        if request.round < 0:
            raise ValueError("round must be non-negative")
        if request.outcome not in (0, 1):
            raise ValueError("outcome must be 0 (Allow) or 1 (Deny)")

        return RecordRulingPayload(
            payout_id=request.payout_id,
            round=request.round,
            outcome=request.outcome,
            is_final=request.is_final,
        )
