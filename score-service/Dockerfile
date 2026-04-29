# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# uv handles dependency resolution + venv.
RUN pip install --no-cache-dir uv

WORKDIR /app

# Copy dependency manifest first so docker can cache the install layer.
COPY pyproject.toml ./
COPY uv.lock* ./

RUN uv sync --frozen --no-dev || uv sync --no-dev

# Copy application code.
COPY app ./app

# Run as non-root.
RUN useradd --uid 10001 --no-create-home --shell /sbin/nologin appuser \
    && chown -R appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0) if urllib.request.urlopen('http://localhost:8000/health').status == 200 else sys.exit(1)" \
    || exit 1

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
