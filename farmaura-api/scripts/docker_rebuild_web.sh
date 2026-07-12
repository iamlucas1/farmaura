#!/bin/sh
set -eu

docker compose build farmaura
exec docker compose up -d --no-deps farmaura
