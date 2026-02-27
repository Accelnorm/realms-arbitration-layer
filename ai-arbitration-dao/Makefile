UV ?= uv

.PHONY: install lint format typecheck test test-cov

install:
	$(UV) sync --extra dev

lint:
	$(UV) run ruff check src tests

format:
	$(UV) run ruff format src tests

typecheck:
	$(UV) run mypy src

test:
	$(UV) run pytest -q

test-cov:
	$(UV) run pytest --cov=ai_arbitration_dao --cov-report=term-missing
