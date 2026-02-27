from __future__ import annotations

from collections.abc import Mapping
from typing import Any

SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "secret",
        "token",
        "private_key",
        "api_key",
        "password",
        "mnemonic",
    }
)


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return any(sensitive in normalized for sensitive in SENSITIVE_KEYS)


def redact_sensitive(data: Any) -> Any:
    if isinstance(data, Mapping):
        return {
            key: "***REDACTED***" if _is_sensitive_key(str(key)) else redact_sensitive(value)
            for key, value in data.items()
        }
    if isinstance(data, list):
        return [redact_sensitive(item) for item in data]
    return data
