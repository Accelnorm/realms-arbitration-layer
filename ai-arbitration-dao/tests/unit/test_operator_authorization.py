"""Tests for SI-019: Least-Privilege Operator Keys."""
from ai_arbitration_dao.orchestration.operator_authorization import (
    AuthorizationContext,
    KeyRole,
    OperationType,
    authorize_operation,
    is_policy_mutation,
)
from ai_arbitration_dao.types import CommandStatus


class TestOperatorKeyLeastPrivilege:
    """Test that delegated operator keys cannot perform policy mutations."""

    def test_operator_key_cannot_mutate_policy(self) -> None:
        """Operator keys MUST be rejected for policy mutation."""
        context = AuthorizationContext(
            key_role=KeyRole.OPERATOR,
            operation=OperationType.POLICY_MUTATION,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.FAILED
        assert "operator keys cannot perform policy mutation" in error

    def test_operator_key_can_create_proposal(self) -> None:
        """Operator keys MUST be allowed to create proposals."""
        context = AuthorizationContext(
            key_role=KeyRole.OPERATOR,
            operation=OperationType.CREATE_PROPOSAL,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.PENDING
        assert error is None

    def test_operator_key_can_vote(self) -> None:
        """Operator keys MUST be allowed to vote."""
        context = AuthorizationContext(
            key_role=KeyRole.OPERATOR,
            operation=OperationType.VOTE,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.PENDING
        assert error is None

    def test_operator_key_can_execute_ruling(self) -> None:
        """Operator keys MUST be allowed to execute rulings."""
        context = AuthorizationContext(
            key_role=KeyRole.OPERATOR,
            operation=OperationType.EXECUTE_RULING,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.PENDING
        assert error is None


class TestGovernanceAuthorityFullAccess:
    """Test that governance authority has full access."""

    def test_governance_can_mutate_policy(self) -> None:
        """Governance authority MUST be allowed to mutate policy."""
        context = AuthorizationContext(
            key_role=KeyRole.GOVERNANCE_AUTHORITY,
            operation=OperationType.POLICY_MUTATION,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.PENDING
        assert error is None

    def test_governance_can_create_proposal(self) -> None:
        """Governance authority MUST be allowed to create proposals."""
        context = AuthorizationContext(
            key_role=KeyRole.GOVERNANCE_AUTHORITY,
            operation=OperationType.CREATE_PROPOSAL,
        )
        status, error = authorize_operation(context)
        
        assert status == CommandStatus.PENDING
        assert error is None


class TestIsPolicyMutation:
    """Test policy mutation detection."""

    def test_policy_mutation_is_detected(self) -> None:
        """Policy mutation operation MUST be detected."""
        assert is_policy_mutation(OperationType.POLICY_MUTATION) is True

    def test_create_proposal_not_policy_mutation(self) -> None:
        """Create proposal MUST NOT be a policy mutation."""
        assert is_policy_mutation(OperationType.CREATE_PROPOSAL) is False

    def test_vote_not_policy_mutation(self) -> None:
        """Vote MUST NOT be a policy mutation."""
        assert is_policy_mutation(OperationType.VOTE) is False

    def test_execute_ruling_not_policy_mutation(self) -> None:
        """Execute ruling MUST NOT be a policy mutation."""
        assert is_policy_mutation(OperationType.EXECUTE_RULING) is False
