from __future__ import annotations

from solders.pubkey import Pubkey


def normalize_pubkey(raw_value: str, *, field_name: str) -> str:
    candidate = raw_value.strip()
    if not candidate:
        raise ValueError(f"{field_name} is required")

    try:
        return str(Pubkey.from_string(candidate))
    except ValueError as exc:
        raise ValueError(f"{field_name} must be a valid Solana public key") from exc
