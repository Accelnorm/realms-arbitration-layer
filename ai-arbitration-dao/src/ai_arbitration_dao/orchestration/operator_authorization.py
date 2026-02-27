"""Authorization for least-privilege operator keys (SI-019)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from ai_arbitration_dao.types import CommandStatus


class KeyRole(StrEnum):
    GOVERNANCE_AUTHORITY = "governance_authority"
    OPERATOR = "operator"


class OperationType(StrEnum):
    CREATE_PROPOSAL = "create_proposal"
    VOTE = "vote"
    EXECUTE_RULING = "execute_ruling"
    POLICY_MUTATION = "policy_mutation"


POLICY_MUTATION_OPERATIONS: frozenset[OperationType] = frozenset({
    OperationType.POLICY_MUTATION,
})


OPERATOR_ALLOWED_OPERATIONS: frozenset[OperationType] = frozenset({
    OperationType.CREATE_PROPOSAL,
    OperationType.VOTE,
    OperationType.EXECUTE_RULING,
})


@dataclass(frozen=True)
class AuthorizationContext:
    key_role: KeyRole
    operation: OperationType


def authorize_operation(context: AuthorizationContext) -> tuple[CommandStatus, str | None]:
    """Authorize an operation based on key role and operation type.
    
    Returns (CommandStatus.PENDING, None) if authorized,
    or (CommandStatus.FAILED, error_message) if rejected.
    """
    if context.key_role == KeyRole.GOVERNANCE_AUTHORITY:
        return CommandStatus.PENDING, None
    
    if context.key_role == KeyRole.OPERATOR:
        if context.operation in POLICY_MUTATION_OPERATIONS:
            return (
                CommandStatus.FAILED,
                "authorization denied: operator keys cannot perform policy mutation operations",
            )
        if context.operation in OPERATOR_ALLOWED_OPERATIONS:
            return CommandStatus.PENDING, None
    
    return (
        CommandStatus.FAILED,
        f"unknown key role or operation: {context.key_role}, {context.operation}",
    )


def is_policy_mutation(operation: OperationType) -> bool:
    """Check if an operation is a policy mutation."""
    return operation in POLICY_MUTATION_OPERATIONS
