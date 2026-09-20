# Equivalente PowerShell de docker_up.sh (mesmo comportamento). Rode de dentro de farmaura-api/.
# Mantenha este arquivo so com caracteres ASCII: o PowerShell 5.1 le arquivo sem BOM como ANSI.
$ErrorActionPreference = "Stop"

docker compose up --build @args
exit $LASTEXITCODE
