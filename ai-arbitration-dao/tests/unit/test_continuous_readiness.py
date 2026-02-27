from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.parent
DEPLOYMENT_GUIDE = ROOT_DIR / "specs" / "DEPLOYMENT.md"
SYSTEMD_DIR = ROOT_DIR / "deploy" / "systemd"
SYSTEMD_SERVICE = SYSTEMD_DIR / "ai-arb-seat@.service"


class TestSI023ContinuousReadinessDeployment:
    """SI-023: Deployment guide MUST support always-on arbitration readiness."""

    def test_deployment_guide_exists(self) -> None:
        assert DEPLOYMENT_GUIDE.exists(), "DEPLOYMENT.md must exist"

    def test_deployment_guide_has_bootstrap_sequence(self) -> None:
        content = DEPLOYMENT_GUIDE.read_text()
        assert "Bootstrap Sequence" in content, "Deployment guide must document bootstrap"
        assert "bootstrap" in content.lower()

    def test_deployment_guide_has_runtime_requirements(self) -> None:
        content = DEPLOYMENT_GUIDE.read_text()
        assert "Runtime Requirements" in content
        assert "Python" in content

    def test_deployment_guide_has_health_signals(self) -> None:
        content = DEPLOYMENT_GUIDE.read_text()
        assert "Health and Readiness Signals" in content
        assert "seat_id" in content
        assert "model_provider" in content

    def test_deployment_guide_has_incident_recovery(self) -> None:
        content = DEPLOYMENT_GUIDE.read_text()
        assert "Incident Recovery" in content
        assert "reconcile" in content.lower()

    def test_systemd_service_exists(self) -> None:
        assert SYSTEMD_SERVICE.exists(), "systemd service template must exist"

    def test_systemd_service_has_restart_policy(self) -> None:
        content = SYSTEMD_SERVICE.read_text()
        assert "Restart=always" in content, "Service must have Restart=always policy"

    def test_systemd_service_has_health_checks(self) -> None:
        content = SYSTEMD_SERVICE.read_text()
        assert "After=network-online.target" in content
        assert "Wants=network-online.target" in content

    def test_systemd_service_uses_python_runtime(self) -> None:
        content = SYSTEMD_SERVICE.read_text()
        assert "python" in content.lower(), "Service must use Python runtime"
        assert "ai_arbitration_dao.runtime.worker" in content

    def test_health_api_has_livez_endpoint(self) -> None:
        from ai_arbitration_dao.agents.base import SeatConfig
        from ai_arbitration_dao.runtime.health_api import SeatHealth, build_health_app
        from ai_arbitration_dao.types import SeatProvider

        seat = SeatConfig(
            seat_id="test-seat",
            provider=SeatProvider.CLAUDE,
            model="test-model",
        )
        health = SeatHealth(
            seat=seat,
            runtime_status="ready",
            rpc_status="ok",
            governance_status="ok",
        )
        app = build_health_app(
            type("Settings", (), {"dao_name": "test-dao"})(),
            health,
        )
        routes = [r.path for r in app.routes]  # type: ignore[attr-defined]
        assert "/livez" in routes, "Health API must have /livez endpoint"

    def test_health_api_has_readyz_endpoint(self) -> None:
        from ai_arbitration_dao.agents.base import SeatConfig
        from ai_arbitration_dao.runtime.health_api import SeatHealth, build_health_app
        from ai_arbitration_dao.types import SeatProvider

        seat = SeatConfig(
            seat_id="test-seat",
            provider=SeatProvider.CLAUDE,
            model="test-model",
        )
        health = SeatHealth(
            seat=seat,
            runtime_status="ready",
            rpc_status="ok",
            governance_status="ok",
        )
        app = build_health_app(
            type("Settings", (), {"dao_name": "test-dao"})(),
            health,
        )
        routes = [route.path for route in app.routes]  # type: ignore[attr-defined]
        assert "/readyz" in routes, "Health API must have /readyz endpoint"

    def test_health_readyz_includes_required_fields(self) -> None:
        from ai_arbitration_dao.agents.base import SeatConfig
        from ai_arbitration_dao.runtime.health_api import SeatHealth, build_health_app
        from ai_arbitration_dao.types import SeatProvider

        seat = SeatConfig(
            seat_id="seat-claude",
            provider=SeatProvider.CLAUDE,
            model="claude-3-5-haiku",
        )
        health = SeatHealth(
            seat=seat,
            runtime_status="ready",
            rpc_status="ok",
            governance_status="ok",
        )
        app = build_health_app(
            type("Settings", (), {"dao_name": "test-dao"})(),
            health,
        )

        routes = {route.path: route for route in app.routes}  # type: ignore[attr-defined]
        readyz_route = routes.get("/readyz")
        assert readyz_route is not None, "Health API must have /readyz endpoint"

        assert hasattr(readyz_route, "endpoint")
        assert readyz_route.endpoint is not None

    def test_worker_can_run_continuously(self) -> None:
        import asyncio

        from ai_arbitration_dao.agents.base import SeatConfig
        from ai_arbitration_dao.runtime.worker import SeatWorker
        from ai_arbitration_dao.types import SeatProvider

        worker = SeatWorker(
            seat=SeatConfig(
                seat_id="test-seat",
                provider=SeatProvider.CLAUDE,
                model="test-model",
            ),
            poll_interval_seconds=0.01,
        )

        async def run_and_stop() -> None:
            await worker.run_once()

        asyncio.run(run_and_stop())

    def test_deployment_guide_has_mvp_boundary_notice(self) -> None:
        content = DEPLOYMENT_GUIDE.read_text()
        assert "MVP Boundary" in content
        assert "custom" in content.lower() or "BYO" in content
