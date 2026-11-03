#!/usr/bin/env bash
# Starts "Llamadas en Español" in Docker.
#
#   ./start.sh            build (if needed) and start the app on http://localhost:3001
#   ./start.sh --tunnel   also start an ngrok HTTPS tunnel for Twilio webhooks
#   ./start.sh --no-build start without rebuilding the image
#
# Configuration and secrets are read from server/.env (git-ignored).
set -euo pipefail
cd "$(dirname "$0")"

TUNNEL=false
BUILD=true
for arg in "$@"; do
  case "$arg" in
    --tunnel) TUNNEL=true ;;
    --no-build) BUILD=false ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg (use --help)" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo "Error: Docker no está instalado." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Error: se necesita 'docker compose' (Compose v2)." >&2; exit 1; }

ENV_FILE=server/.env
if [[ ! -f "$ENV_FILE" ]]; then
  cp server/.env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Se ha creado $ENV_FILE a partir de la plantilla. Rellénelo para hacer llamadas reales (el modo demostración funciona sin él)."
fi

# Reads KEY=value from server/.env without executing it.
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }

APP_PORT="${APP_PORT:-3001}"
export APP_PORT

COMPOSE=(docker compose)
if $TUNNEL; then
  NGROK_AUTHTOKEN="$(env_value NGROK_AUTHTOKEN)"
  NGROK_DOMAIN="$(env_value NGROK_DOMAIN)"
  if [[ -z "$NGROK_AUTHTOKEN" ]]; then
    echo "Error: --tunnel necesita NGROK_AUTHTOKEN en $ENV_FILE (https://dashboard.ngrok.com/get-started/your-authtoken)." >&2
    exit 1
  fi
  if [[ -z "$NGROK_DOMAIN" ]]; then
    echo "Error: --tunnel necesita NGROK_DOMAIN en $ENV_FILE (su dominio estático gratuito de ngrok)." >&2
    exit 1
  fi
  PUBLIC_BASE_URL="$(env_value PUBLIC_BASE_URL)"
  if [[ "$PUBLIC_BASE_URL" != "https://$NGROK_DOMAIN" ]]; then
    echo "Aviso: PUBLIC_BASE_URL ($PUBLIC_BASE_URL) no coincide con https://$NGROK_DOMAIN. Twilio no podrá alcanzar los webhooks." >&2
  fi
  export NGROK_AUTHTOKEN NGROK_DOMAIN
  COMPOSE+=(--profile tunnel)
fi

if $BUILD; then
  "${COMPOSE[@]}" up -d --build
else
  "${COMPOSE[@]}" up -d
fi

echo -n "Esperando a que el servidor responda"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo " ✓"
    echo
    echo "Aplicación disponible en: http://localhost:${APP_PORT}"
    $TUNNEL && echo "Túnel HTTPS (webhooks de Twilio): https://${NGROK_DOMAIN}   ·   Inspector ngrok: http://localhost:4040"
    if [[ -z "$(env_value APP_PASSWORD)" ]]; then
      docker compose logs app 2>/dev/null | grep -i "contraseña temporal" | tail -n1 || true
    fi
    echo "Para detenerla: ./stop.sh"
    exit 0
  fi
  echo -n "."
  sleep 1
done
echo
echo "El servidor no respondió a tiempo. Revise los registros con: docker compose logs app" >&2
exit 1
