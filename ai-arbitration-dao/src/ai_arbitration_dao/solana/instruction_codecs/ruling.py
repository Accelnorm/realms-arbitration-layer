from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class RecordRulingPayload:
    payout_id: int
    round: int
    outcome: int
    is_final: bool

    def to_bytes(self) -> bytes:
        return b"".join(
            (
                int(self.payout_id).to_bytes(8, byteorder="little", signed=False),
                int(self.round).to_bytes(1, byteorder="little", signed=False),
                int(self.outcome).to_bytes(1, byteorder="little", signed=False),
                bytes([1 if self.is_final else 0]),
            )
        )

    def payload_hash_hex(self) -> str:
        return hashlib.sha256(self.to_bytes()).hexdigest()
