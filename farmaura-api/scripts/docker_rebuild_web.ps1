# Equivalente PowerShell de docker_rebuild_web.sh (mesmo comportamento). Rode de dentro de farmaura-api/.
# Mantenha este arquivo so com caracteres ASCII: o PowerShell 5.1 le arquivo sem BOM como ANSI.
$ErrorActionPreference = "Stop"

docker compose build farmaura
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose up -d --no-deps farmaura
exit $LASTEXITCODE
