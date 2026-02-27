from __future__ import annotations

import logging
from typing import cast

import structlog
from structlog.typing import EventDict, WrappedLogger

from ai_arbitration_dao.observability.redaction import redact_sensitive


class RedactionProcessor:
    def __call__(self, _: WrappedLogger, __: str, event_dict: EventDict) -> EventDict:
        return cast(EventDict, redact_sensitive(dict(event_dict)))


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            RedactionProcessor(),
            structlog.processors.JSONRenderer(sort_keys=True),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
    )


def get_logger(name: str = "ai_arbitration_dao") -> structlog.stdlib.BoundLogger:
    return cast(structlog.stdlib.BoundLogger, structlog.get_logger(name))
