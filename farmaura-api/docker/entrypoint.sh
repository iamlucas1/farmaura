#!/bin/sh
set -eu

mkdir -p /app/storage/private /app/storage/quarantine /app/storage/tmp

uv run python scripts/bootstrap_database.py

exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
