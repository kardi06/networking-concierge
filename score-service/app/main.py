from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

from .models import ScoreRequest, ScoreResponse
from .scoring import score_match

# Load env from repo root if present (single source of truth in dev).
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
if ROOT_ENV.exists():
    load_dotenv(ROOT_ENV)


# ---------- JSON-formatted logging --------------------------------------------
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        for key in ("req_id", "route", "method", "status", "latency_ms"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload)


root_logger = logging.getLogger()
if not root_logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root_logger.addHandler(handler)
root_logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("score-service")


# ---------- Anthropic client lifecycle ----------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is required")
    app.state.anthropic = AsyncAnthropic(api_key=api_key)
    logger.info("score-service starting")
    try:
        yield
    finally:
        await app.state.anthropic.close()
        logger.info("score-service stopping")


app = FastAPI(
    title="MyConnect score-service",
    version="0.1.0",
    lifespan=lifespan,
)


# ---------- Request/response middleware ---------------------------------------
@app.middleware("http")
async def request_logger(request: Request, call_next):
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    latency_ms = int((time.perf_counter() - start) * 1000)
    logger.info(
        "%s %s -> %s",
        request.method,
        request.url.path,
        response.status_code,
        extra={
            "req_id": req_id,
            "method": request.method,
            "route": request.url.path,
            "status": response.status_code,
            "latency_ms": latency_ms,
        },
    )
    response.headers["x-request-id"] = req_id
    return response


# ---------- Routes ------------------------------------------------------------
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/score", response_model=ScoreResponse)
async def score(req: ScoreRequest) -> ScoreResponse:
    try:
        return await score_match(req, app.state.anthropic)
    except ValueError as e:
        # Model returned malformed structure — propagate as 502 so the caller
        # (NestJS) can present this as an upstream issue, not a client error.
        logger.error("score_match parse error: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        logger.exception("score_match unexpected error")
        raise HTTPException(status_code=500, detail="internal error") from e
