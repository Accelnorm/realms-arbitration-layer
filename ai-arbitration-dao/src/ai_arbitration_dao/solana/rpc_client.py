from __future__ import annotations

from solana.rpc.async_api import AsyncClient

from ai_arbitration_dao.config import AppSettings


class RpcClientFactory:
    """Thin factory for AsyncClient to keep adapter construction deterministic."""

    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings

    def create(self) -> AsyncClient:
        return AsyncClient(self._settings.solana_rpc_url)
