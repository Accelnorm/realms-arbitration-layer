from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from ai_arbitration_dao.domain.dispute_snapshot import DisputeSnapshot


@dataclass(slots=True, frozen=True)
class RulingPayload:
    serialized: str
    payload_hash: str
    is_final: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "serialized": self.serialized,
            "payload_hash": self.payload_hash,
            "is_final": self.is_final,
        }


def compile_ruling_payload(snapshot: DisputeSnapshot, *, is_final: bool = False) -> RulingPayload:
    payload_data = {
        **snapshot.canonical_fields(),
        "is_final": is_final,
    }
    serialized = json.dumps(payload_data, sort_keys=True, separators=(",", ":"))
    payload_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return RulingPayload(serialized=serialized, payload_hash=payload_hash, is_final=is_final)
