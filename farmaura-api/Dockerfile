# syntax=docker/dockerfile:1.7

FROM python:3.13.13-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.11.19

COPY pyproject.toml README.md .python-version ./
COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY scripts ./scripts
COPY storage ./storage
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

RUN uv sync --no-dev

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
