from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "dev"
    log_level: str = "INFO"
    dao_name: str = "ai-arbitration-dao"

    solana_rpc_url: str = "http://127.0.0.1:8899"
    governance_program_id: str = "GovER5Lthms1111111111111111111111111111111"
    safe_treasury_program_id: str = "SafeTreasury1111111111111111111111111111111"

    claude_model: str = "claude-3-5-haiku-20241022"
    openai_model: str = "gpt-4o-mini"
    minimax_model: str = "minimax-m2.5"


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()
