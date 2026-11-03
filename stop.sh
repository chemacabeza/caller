#!/usr/bin/env bash
# Stops "Llamadas en Español".
#
#   ./stop.sh          stop and remove the containers (app + tunnel, if running)
#   ./stop.sh --clean  also remove the built image
#
# Transcripts live only in memory, so stopping the app deletes them.
set -euo pipefail
cd "$(dirname "$0")"

CLEAN=false
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg (use --help)" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo "Error: Docker no está instalado." >&2; exit 1; }

if $CLEAN; then
  docker compose --profile tunnel down --rmi local --remove-orphans
else
  docker compose --profile tunnel down --remove-orphans
fi
echo "Aplicación detenida."
