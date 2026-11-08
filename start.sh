#!/usr/bin/env bash
# Starts "Llamadas en Español" in Docker.
#
#   ./start.sh              build (if needed), start the app on http://localhost:3001 and a
#                           Cloudflare quick tunnel for real calls (same as --cloudflare)
#   ./start.sh --cloudflare same as above (no account). A tunnel that is still running is reused,
#                           so its URL stays the same; it changes after ./stop.sh or a reboot
#   ./start.sh --new-url    force a new Cloudflare quick tunnel (new URL)
#   ./start.sh --tunnel     use an ngrok tunnel instead (needs NGROK_AUTHTOKEN/NGROK_DOMAIN)
#   ./start.sh --local      start without any tunnel (demo mode unless PUBLIC_BASE_URL is set)
#   ./start.sh --no-build   start without rebuilding the image
#
# Configuration and secrets are read from server/.env (git-ignored).
set -euo pipefail
cd "$(dirname "$0")"

NGROK=false
CLOUDFLARE=false
LOCAL=false
NEW_URL=false
BUILD=true
for arg in "$@"; do
  case "$arg" in
    --tunnel|--ngrok) NGROK=true ;;
    --cloudflare) CLOUDFLARE=true ;;
    --local|--no-tunnel) LOCAL=true ;;
    --new-url) NEW_URL=true ;;
    --no-build) BUILD=false ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg (use --help)" >&2; exit 2 ;;
  esac
done
if [[ "$NGROK$CLOUDFLARE$LOCAL" == *true*true* ]]; then
  echo "Error: use solo una de --cloudflare, --tunnel o --local." >&2
  exit 2
fi
# The Cloudflare quick tunnel is the default, so real calls work out of the box.
if ! $NGROK && ! $LOCAL; then CLOUDFLARE=true; fi

command -v docker >/dev/null || { echo "Error: Docker no está instalado." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Error: se necesita 'docker compose' (Compose v2)." >&2; exit 1; }

ENV_FILE=server/.env
if [[ ! -f "$ENV_FILE" ]]; then
  cp server/.env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Se ha creado $ENV_FILE a partir de la plantilla. Rellénelo para hacer llamadas reales (el modo demostración funciona sin él)."
fi

# Percent-encodes a string for use in a URL.
urlencode() {
  local LC_ALL=C s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_-]) out+="$c" ;;
      *) out+="$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

# Reads KEY=value from server/.env without executing it.
env_value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true; }

APP_PORT="${APP_PORT:-3001}"
export APP_PORT
# Empty unless the Cloudflare tunnel is used; the app then falls back to PUBLIC_BASE_URL.
TUNNEL_PUBLIC_BASE_URL=""
export TUNNEL_PUBLIC_BASE_URL

COMPOSE=(docker compose)
PUBLIC_URL=""

if $BUILD; then
  "${COMPOSE[@]}" build app
fi

if $NGROK; then
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
  PUBLIC_URL="https://$NGROK_DOMAIN"
fi

# URL of the quick tunnel in the running cloudflared container, if any.
cloudflared_url() {
  docker compose --profile cloudflare logs cloudflared 2>/dev/null \
    | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '^https://api\.' | tail -n1 || true
}

if $CLOUDFLARE; then
  TUNNEL_PUBLIC_BASE_URL=""
  # Quick tunnel URLs are random, so keep the URL stable by reusing a tunnel that is still alive.
  # Cloudflare answers 530 (or DNS fails, 000) once a quick tunnel is gone; any other code means
  # the tunnel is up (502 is fine: it only means the app behind it is not running right now).
  if ! $NEW_URL && [[ -n "$(docker compose --profile cloudflare ps -q --status running cloudflared 2>/dev/null)" ]]; then
    existing="$(cloudflared_url)"
    if [[ -n "$existing" ]]; then
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$existing/api/health" || true)"
      if [[ "$code" != "000" && "$code" != "530" ]]; then
        TUNNEL_PUBLIC_BASE_URL="$existing"
        echo "Se reutiliza el túnel de Cloudflare en marcha (la URL no cambia): $existing"
      else
        echo "El túnel anterior ($existing) ya no responde; se crea uno nuevo."
      fi
    fi
  fi
  # Otherwise start a fresh quick tunnel: its random URL must be known before the app starts.
  # Creating a quick tunnel occasionally fails on Cloudflare's side, so retry a few times.
  for attempt in 1 2 3; do
    [[ -n "$TUNNEL_PUBLIC_BASE_URL" ]] && break
    docker compose --profile cloudflare up -d --force-recreate --no-deps cloudflared
    echo -n "Esperando la URL del túnel de Cloudflare (intento $attempt/3)"
    for _ in $(seq 1 60); do
      # api.trycloudflare.com is Cloudflare's API (it appears in error messages), not our tunnel.
      TUNNEL_PUBLIC_BASE_URL="$(cloudflared_url)"
      [[ -n "$TUNNEL_PUBLIC_BASE_URL" ]] && break
      docker compose --profile cloudflare logs cloudflared 2>/dev/null | grep -q 'failed to request quick Tunnel' && break
      echo -n "."
      sleep 1
    done
    echo
    [[ -n "$TUNNEL_PUBLIC_BASE_URL" ]] && break
    echo "Cloudflare no pudo crear el túnel en este intento; reintentando…" >&2
    sleep 3
  done
  if [[ -z "$TUNNEL_PUBLIC_BASE_URL" ]]; then
    echo "Error: cloudflared no devolvió una URL. Revise: docker compose --profile cloudflare logs cloudflared" >&2
    exit 1
  fi
  export TUNNEL_PUBLIC_BASE_URL
  PUBLIC_URL="$TUNNEL_PUBLIC_BASE_URL"
else
  # Don't leave an old quick tunnel pointing at the app with a URL the app no longer uses.
  docker compose --profile cloudflare rm -sf cloudflared >/dev/null 2>&1 || true
fi

# (Re)create the app so it picks up the current TUNNEL_PUBLIC_BASE_URL.
"${COMPOSE[@]}" up -d

echo -n "Esperando a que el servidor responda"
ok=false
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then ok=true; break; fi
  echo -n "."
  sleep 1
done
if ! $ok; then
  echo
  echo "El servidor no respondió a tiempo. Revise los registros con: docker compose logs app" >&2
  exit 1
fi
echo " ✓"

if [[ -n "$PUBLIC_URL" ]]; then
  # New trycloudflare hostnames can take a few seconds to resolve.
  echo -n "Comprobando el túnel HTTPS $PUBLIC_URL"
  tunnel_ok=false
  for _ in $(seq 1 45); do
    if curl -fsS --max-time 5 "$PUBLIC_URL/api/health" >/dev/null 2>&1; then tunnel_ok=true; break; fi
    echo -n "."
    sleep 2
  done
  if $tunnel_ok; then
    echo " ✓"
    # Twilio webhooks must be reachable and must reject unsigned requests.
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$PUBLIC_URL/twilio/status/comprobacion" || true)"
    if [[ "$code" == "403" ]]; then
      echo "Webhooks de Twilio accesibles y protegidos por firma (403 sin firma) ✓"
    else
      echo "Aviso: la comprobación del webhook devolvió HTTP $code (se esperaba 403)." >&2
    fi
  else
    echo
    echo "Aviso: el túnel todavía no responde. Puede tardar un poco más; compruebe $PUBLIC_URL/api/health." >&2
  fi
fi

echo
echo "Aplicación disponible en: http://localhost:${APP_PORT}"
if $CLOUDFLARE; then
  echo "Túnel HTTPS (Cloudflare): $PUBLIC_URL"
  echo "La URL se mantiene en los próximos ./start.sh; cambia tras ./stop.sh, un reinicio del equipo o ./start.sh --new-url."
  echo "La aplicación usa esta URL automáticamente para los webhooks de Twilio."
fi
$NGROK && echo "Túnel HTTPS (ngrok): $PUBLIC_URL   ·   Inspector ngrok: http://localhost:4040"
# Show the web UI password next to the links (only in this terminal; it is never sent anywhere).
APP_PASSWORD_VALUE="$(env_value APP_PASSWORD)"
if [[ -n "$APP_PASSWORD_VALUE" ]]; then
  echo "Contraseña de la interfaz (APP_PASSWORD en $ENV_FILE): $APP_PASSWORD_VALUE"
  # Login link: the page fills in the password after "#" and logs in by itself. The part after "#"
  # stays in the browser (never sent to Cloudflare or the server). Share it only with people you trust.
  enc="$(urlencode "$APP_PASSWORD_VALUE")"
  echo "Enlace con inicio de sesión automático: http://localhost:${APP_PORT}/#clave=$enc"
  [[ -n "$PUBLIC_URL" ]] && echo "Enlace público con inicio de sesión automático: $PUBLIC_URL/#clave=$enc"
else
  docker compose logs app 2>/dev/null | grep -i "contraseña temporal" | tail -n1 || true
fi
echo "Para detenerla: ./stop.sh"
