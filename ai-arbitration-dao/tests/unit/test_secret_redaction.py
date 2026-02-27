"""Tests for SI-018: Secret Redaction."""
from ai_arbitration_dao.observability.redaction import redact_sensitive


def test_redact_private_key() -> None:
    """Must redact private_key fields."""
    data = {"private_key": "sk-12345secret", "public_key": "pub-abc"}
    result = redact_sensitive(data)
    assert result["private_key"] == "***REDACTED***"
    assert result["public_key"] == "pub-abc"


def test_redact_api_key() -> None:
    """Must redact api_key fields."""
    data = {"api_key": "sk-api-secret-12345", "endpoint": "https://api.example.com"}
    result = redact_sensitive(data)
    assert result["api_key"] == "***REDACTED***"
    assert result["endpoint"] == "https://api.example.com"


def test_redact_token() -> None:
    """Must redact token fields."""
    data = {"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "user": "admin"}
    result = redact_sensitive(data)
    assert result["token"] == "***REDACTED***"
    assert result["user"] == "admin"


def test_redact_password() -> None:
    """Must redact password fields."""
    data = {"password": "super_secret_password", "username": "admin"}
    result = redact_sensitive(data)
    assert result["password"] == "***REDACTED***"
    assert result["username"] == "admin"


def test_redact_mnemonic() -> None:
    """Must redact mnemonic fields."""
    mnemonic = (
        "abandon abandon abandon abandon abandon abandon abandon "
        "abandon abandon abandon abandon about"
    )
    data = {"mnemonic": mnemonic, "address": "123 Main St"}
    result = redact_sensitive(data)
    assert result["mnemonic"] == "***REDACTED***"
    assert result["address"] == "123 Main St"


def test_redact_secret() -> None:
    """Must redact secret fields."""
    data = {"secret": "my_secret_value", "name": "test"}
    result = redact_sensitive(data)
    assert result["secret"] == "***REDACTED***"
    assert result["name"] == "test"


def test_redact_nested_sensitive() -> None:
    """Must redact nested sensitive fields."""
    data = {"outer": {"inner_api_key": "secret123", "normal": "value"}}
    result = redact_sensitive(data)
    assert result["outer"]["inner_api_key"] == "***REDACTED***"
    assert result["outer"]["normal"] == "value"


def test_redact_list_of_sensitive() -> None:
    """Must redact sensitive fields in lists."""
    data = {"requests": [{"api_key": "secret1"}, {"api_key": "secret2"}]}
    result = redact_sensitive(data)
    assert result["requests"][0]["api_key"] == "***REDACTED***"
    assert result["requests"][1]["api_key"] == "***REDACTED***"


def test_redact_case_insensitive() -> None:
    """Must redact keys regardless of case."""
    data = {"API_KEY": "secret", "Private_Key": "secret", "TOKEN": "secret"}
    result = redact_sensitive(data)
    assert result["API_KEY"] == "***REDACTED***"
    assert result["Private_Key"] == "***REDACTED***"
    assert result["TOKEN"] == "***REDACTED***"


def test_redact_partial_key_match() -> None:
    """Must redact keys containing sensitive substrings."""
    data = {"my_api_key": "secret", "auth_token": "secret", "user_password": "secret"}
    result = redact_sensitive(data)
    assert result["my_api_key"] == "***REDACTED***"
    assert result["auth_token"] == "***REDACTED***"
    assert result["user_password"] == "***REDACTED***"
