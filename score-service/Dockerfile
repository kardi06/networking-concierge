# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# uv handles dependency resolution + venv.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy dependency manifest + README (hatchling validates readme field).
COPY pyproject.toml uv.lock* README.md ./

# `--no-install-project` installs deps only, skips building this package as
# editable. Project code is copied below and run via `uv run`.
RUN uv sync --frozen --no-dev --no-install-project \
    || uv sync --no-dev --no-install-project

# Copy application code.
COPY app ./app

# Run as non-root.
RUN useradd --uid 10001 --no-create-home --shell /sbin/nologin appuser \
    && chown -R appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import os,urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8000') + '/health').status == 200 else sys.exit(1)" \
    || exit 1

# Run uvicorn from the venv directly. `uv run` would need a writable cache dir
# at $HOME/.cache/uv, which doesn't exist for appuser (--no-create-home).
#
# HOST and PORT come from the environment so one image serves both targets:
# docker compose uses the defaults, Railway sets HOST=:: because its private
# network is IPv6-only in environments created before 16 Oct 2025. The shell
# form is what expands them; `exec` keeps uvicorn as PID 1 to receive signals.
CMD ["sh", "-c", "exec .venv/bin/uvicorn app.main:app --host \"${HOST:-0.0.0.0}\" --port \"${PORT:-8000}\""]
