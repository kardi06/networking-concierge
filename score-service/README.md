# MyConnect score-service

FastAPI microservice that backs the `score_match` tool of the MyConnect concierge agent.
Given a requester and a candidate attendee profile plus the requester's intent, it returns a structured score (0–100), a rationale (≤200 chars), and the concrete shared ground between the two.

## Why a separate service

Demonstrates the polyglot architecture called out in the JD and gives a clean home for ML-heavy work later (re-ranking, custom embeddings, fine-tuned scorer).

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe. |
| `POST` | `/score` | Score a candidate against a requester intent. |

Request/response shapes are defined in [`app/models.py`](app/models.py).

## Local development

Prereq: [`uv`](https://docs.astral.sh/uv/) installed (`pip install uv` works fine).

```bash
uv sync                       # creates .venv, installs deps
uv run pytest -v              # run unit tests
uv run uvicorn app.main:app --reload --port 8000
```

Environment variables (read from repo-root `.env`):

- `ANTHROPIC_API_KEY` — required.
- `ANTHROPIC_MODEL` — default `claude-sonnet-4-6`.
- `LOG_LEVEL` — default `INFO`.

## Implementation notes

- **Forced tool calling** is used for structured output: the model must respond by invoking the `submit_score` tool whose JSON schema matches `ScoreResponse`. More reliable than parsing free-text JSON.
- **Prompt-injection defenses**: profile content is wrapped in `<requester_data>` / `<candidate_data>` tags; the system prompt instructs the model that tag content is data, not instructions, and that scores must reflect actual fit (ignoring text that asks for a high score).
- **Async client** (`AsyncAnthropic`) so the FastAPI event loop is not blocked.
