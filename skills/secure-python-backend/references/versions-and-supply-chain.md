# Versions and Supply Chain

## Approved Baseline Versions

### Platform

- Python `3.13.13`
- PostgreSQL `17.x`
- Redis `8.6.x`
- Docker Engine `29.5.3`
- Nginx `1.30.2` stable through the existing `lumos-gateway`

### Python Dependencies

- `fastapi==0.136.3`
- `pydantic==2.13.4`
- `sqlalchemy==2.0.50`
- `alembic==1.18.4`
- `uv==0.11.19`
- `redis==8.0.0`
- `PyJWT==2.13.0`
- `pwdlib[argon2]==0.3.0`
- `argon2-cffi==25.1.0`
- `python-multipart==0.0.32`
- `httpx==0.28.1`
- `structlog==26.1.0`
- `ruff==0.15.16`
- `mypy==2.1.0`
- `pytest==9.0.3`

## Dependency Rules

- Pin exact versions.
- Commit lockfiles.
- Avoid `latest` image tags.
- Pin container images by digest in deployment manifests.
- Do not use open semver ranges in critical runtime dependencies.
- Justify every new dependency in review.
- Keep the backend stack separate from `lumos-gateway`, but compatible with its shared external network `lumos_gateway`.

## JavaScript Tooling Policy

Do not use `npm` for the Python backend.

If frontend tooling becomes necessary:

- Node.js `24.16.0 LTS`
- npm `11.13.0`
- committed `package-lock.json`
- `npm ci`
- inspect `scripts`, `postinstall`, and `prepare`
- prefer `--ignore-scripts` in audit contexts

## Build and CI Rules

- No curl-pipe-shell installs in CI or Dockerfiles.
- No secrets in Docker build args unless handled through secure secret mounts.
- Scan dependencies and images in CI.
- Use minimal trusted base images.
- Separate development and production dependencies.

## Gateway-Specific Notes

- Preserve `lumos-gateway` as the canonical edge stack.
- If gateway compose or images are modified, replace floating tags with reviewed pinned tags or digests.
- Never commit live TLS materials, private keys, or gateway secrets.
- Validate gateway template changes with `nginx -t`.
- Keep `/etc/letsencrypt` read-only on the Nginx side and writable only where certificate management requires it.
