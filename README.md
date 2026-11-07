# Llamadas en Español

[![CI](https://github.com/chemacabeza/caller/actions/workflows/ci.yml/badge.svg)](https://github.com/chemacabeza/caller/actions/workflows/ci.yml)

Web app that places a real phone call to a Spanish number, has a clear Spain-Spanish voice (`es-ES`, Amazon Polly via Twilio) ask your question, listens to the answer with Spanish speech recognition, and shows the recognized words in the **“Respuesta recibida”** panel.

```
[Llamar] ─▶ backend ─▶ Twilio REST: create call (timeLimit 120 s, record=false)
                         │
recipient picks up ─▶ Twilio fetches /twilio/voice/:id
                         ◀─ <Pause 2s/> <Say Polly.Lucia-Neural es-ES>message</Say> <Gather speech es-ES/>
answer (or silence) ─▶ /twilio/gather/:id?attempt=N
                         ◀─ speech:   <Say>Muchas gracias. Que tenga un buen día.</Say><Hangup/>
                         ◀─ silence (1st): repeat question + <Gather/>
                         ◀─ silence (2nd): goodbye + <Hangup/>  → "No se recibió una respuesta."
status changes ─▶ /twilio/status/:id  (ringing, in-progress, completed, busy, no-answer…)
browser ◀─ server-sent events (polling fallback) with status + transcript
```

Call completion (`status`: Llamando / En llamada / Finalizada / Ocupado / Sin respuesta / Error) is tracked **separately** from whether an answer was received (`answerStatus`: pendiente / recibida / sin_respuesta). The literal transcript is always shown. A small, conservative heuristic lists any clock times it finds in it. If it finds none, it says so and never invents an opening time.

## Contents

```
e2e/      Playwright end-to-end tests (fake Twilio + signed webhooks)
server/   Node + Express + TypeScript: API, Twilio webhooks, TwiML, demo simulator
web/      React + TypeScript (Vite): the Spanish UI
Dockerfile, docker-compose.yml, start.sh, stop.sh
```

## Quick start (Docker)

```bash
cp server/.env.example server/.env   # start.sh does this for you if missing
./start.sh                           # http://localhost:3001 + Cloudflare quick tunnel for real calls (no account)
./start.sh --cloudflare              # same as above
./start.sh --tunnel                  # …or an ngrok tunnel with a fixed domain (see below)
./start.sh --local                   # no tunnel (demo mode unless PUBLIC_BASE_URL is set)
./stop.sh                            # stop (add --clean to remove the image)
```

If `APP_PASSWORD` is empty, a temporary password is printed by `start.sh` (and in `docker compose logs app`).

Without Twilio configuration the app runs in **demo mode** only.

## Running locally without Docker (development)

Requires Node 22+.

```bash
npm install
npm run dev        # backend on :3001 (tsx watch) + frontend on :5173 (Vite, proxies /api)
npm test           # server + web tests (Twilio is mocked; no calls are made)
npm run build && npm start   # production build served by the backend on :3001
```

Open http://localhost:5173 in development, or http://localhost:3001 after `npm run build`.

## Configuration (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | for real calls | `AC…` from Twilio Console → Account → API keys & tokens |
| `TWILIO_AUTH_TOKEN` | for real calls | Auth token (also used to validate webhook signatures) |
| `TWILIO_FROM_NUMBER` | for real calls | A Twilio number you own, or a verified caller ID, in E.164. Must differ from the destination. `TWILIO_PHONE_NUMBER` is accepted as an alias. |
| `PUBLIC_BASE_URL` | for real calls | Public **HTTPS** URL forwarding to port 3001, no trailing slash |
| `TUNNEL_PUBLIC_BASE_URL` | no | Set automatically by `./start.sh --cloudflare`; overrides `PUBLIC_BASE_URL` |
| `DEFAULT_DESTINATION_NUMBER` | no | Number pre-filled in the form (Spain, France, Germany, Italy, China, or USA/Canada), default `+34 955 74 88 35`. Still editable in the UI. |
| `SAVED_NUMBERS` | no | Comma-separated numbers shown as one-tap buttons under the phone field, e.g. `+86 138 0013 8000, +1-707-555-0123, +33 6 39 98 12 34, +491711234567` |
| `TTS_VOICE` | no | Default `Polly.Lucia-Neural`. Other es-ES voices: `Polly.Sergio-Neural`, `Polly.Lucia-Generative` / `Polly.Sergio-Generative` (public beta), `Polly.Conchita`, `Polly.Enrique` |
| `TTS_RATE` | no | SSML prosody rate for Polly voices, default `95%`; empty disables |
| `GREETING_PAUSE_SECONDS` | no | Silence after pick-up for the recipient’s “¿Diga?” (default 2) |
| `GATHER_TIMEOUT_SECONDS` | no | Wait for the recipient to start speaking (default 8) |
| `SPEECH_TIMEOUT_SECONDS` | no | Silence that ends their answer (default 3, so normal pauses are not cut off) |
| `SPEECH_MODEL` | no | Optional Twilio `speechModel` (e.g. `phone_call`, `googlev2_telephony`) |
| `MAX_CALL_SECONDS` | no | Hard limit, default and max 120 |
| `APP_PASSWORD` | recommended | Password for the web UI |
| `COOKIE_SECURE` | no | `true` if you open the UI over HTTPS |
| `TRANSCRIPT_TTL_MINUTES` | no | How long a finished call stays in memory (default 60) |

Voice names were checked against Twilio’s [text-to-speech docs](https://www.twilio.com/docs/voice/twiml/say/text-speech) and [`<Gather>` docs](https://www.twilio.com/docs/voice/twiml/gather) (November 2026). Twilio notes that third-party voices can change, so the voice is configurable.

## Twilio setup

1. **Account & credentials.** Sign up at twilio.com. In Console → *Account → API keys & tokens*, copy the **Account SID** and **Auth Token** into `server/.env`. Never commit that file (it is git-ignored and excluded from the Docker image). If a token is ever exposed, rotate it there.
2. **Outgoing caller ID** (`TWILIO_FROM_NUMBER`). Either buy a Twilio voice number (*Phone Numbers → Buy a number*), or verify a number you own (*Phone Numbers → Manage → Verified Caller IDs*). Spanish (+34) Twilio numbers need a regulatory bundle (address + ID). A US number works, but the recipient will see a foreign number and may be less likely to pick up.
3. **Enable calls to Spain.** Console → *Voice → Settings → Geo permissions* → tick **Spain**. Otherwise Twilio rejects the call (error 21215 / 13227, which the UI explains).
4. **Trial account restrictions.**
   - You can only call **verified** numbers (error 21219 otherwise).
   - Twilio plays an English trial notice before your TwiML and asks the callee to **press a key**. A business receptionist will usually hang up before hearing your message. To call a business, upgrade the account.
5. **Charges.** Outbound calls to Spain are billed per minute (landline and mobile prices differ). Text-to-speech and speech recognition (`<Gather input="speech">`) are billed separately. Check the current prices at twilio.com/voice/pricing/es. Each call is capped at 2 minutes and recording is off.

## Public HTTPS URL for webhooks (local development)

Twilio must reach `/twilio/voice/:id`, `/twilio/gather/:id`, and `/twilio/status/:id` on your machine over HTTPS. The backend passes these URLs to Twilio per call, so **you don’t configure anything on the Twilio phone number itself**.

**ngrok** (free static domain recommended, so the URL doesn’t change):

```bash
ngrok config add-authtoken <token>
ngrok http --url=your-subdomain.ngrok-free.app 3001
# server/.env:  PUBLIC_BASE_URL=https://your-subdomain.ngrok-free.app
```

Or use the bundled container: set `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` in `server/.env`, then `./start.sh --tunnel`. The ngrok inspector runs at http://localhost:4040.

**Cloudflare quick tunnel (no account, easiest).** Run `./start.sh` (or `./start.sh --cloudflare`; the tunnel is the default). The script:

1. starts a `cloudflare/cloudflared` container and reads the random `https://…trycloudflare.com` URL it gets;
2. passes that URL to the app as `TUNNEL_PUBLIC_BASE_URL`, which overrides `PUBLIC_BASE_URL` (your `.env` is not modified);
3. checks that `/api/health` answers through the tunnel and that an unsigned webhook is rejected with 403.

The URL changes every time the tunnel starts, so the container is not auto-restarted; just run `./start.sh --cloudflare` again. Quick tunnels have no uptime guarantee and are meant for testing. Note that the UI is also reachable through the tunnel URL, protected by `APP_PASSWORD`, so set a strong one.

Without Docker: `cloudflared tunnel --url http://localhost:3001`, then put the printed URL in `PUBLIC_BASE_URL` (or `TUNNEL_PUBLIC_BASE_URL`) and restart the backend.

Always point the tunnel at the **backend port 3001**, not Vite’s 5173. Restart the backend after changing `.env`.

## Security

- Twilio credentials live only on the server. The browser never sees them.
- The call-control API requires a password login: an HttpOnly, `SameSite=Strict` session cookie, plus a JSON-only rule as CSRF defence, and brute-force throttling.
- Every Twilio webhook is checked against `X-Twilio-Signature` using the Auth Token and `PUBLIC_BASE_URL`. Invalid signatures get 403. Callbacks whose `CallSid` doesn’t match the call are ignored.
- **Duplicate calls are prevented:** only one call can be active at a time (409 otherwise), with a lock covering the creation window. The *Llamar* button also disables itself synchronously.
- Phone numbers are normalized and validated server-side. Supported destinations:
  - **Spain (+34):** 9 digits without a country code are treated as Spanish. Premium prefixes 803, 806, 807, 905, and 907 are refused.
  - **France (+33):** e.g. `+33 6 39 98 12 34`. `+33`/`0033` is required. 08 special-rate numbers are refused, except 080 freephone.
  - **Germany (+49):** mobiles such as `+49 171 1234567`, landlines, and 0800. `+49`/`0049` is required. 0900, 0137, 0118, and 0180 numbers are refused.
  - **Italy (+39):** mobiles such as `+39 312 345 6789`, landlines that keep their leading 0 (`+39 06 1234 5678`), and 800/803. `+39`/`0039` is required. 89x, 16x, 14x, 178, and 199 numbers are refused.
  - **China (+86):** mobiles such as `+86 138 0013 8000`, and landlines with an area code. `+86`/`0086` is required.
  - **USA/Canada (+1):** e.g. `+1-707-555-0123`. `+1`/`001` is required. Premium 900/976 numbers are refused.

  Each destination country must also be enabled in Twilio Geo permissions. China does not appear in Twilio’s geo-permission list for this account, so calls there need Twilio Support.
- Recording is disabled (`record: false`, no `<Record>`). Transcripts are held **in memory only**, visible only to the session that made the call, and deleted after `TRANSCRIPT_TTL_MINUTES`, on logout, or on restart.

## Demo mode

The **“Modo demostración”** checkbox (forced on when Twilio isn’t configured) runs the same state machine on the server without contacting Twilio. You can pick a scenario: answer with a schedule, answer without a time, silence (the question is repeated, then “No se recibió una respuesta”), busy, or no answer. Simulated calls carry `simulated: true`, the transcript is prefixed `[SIMULADO]`, and the UI shows purple **SIMULADO** badges with a dashed transcript box.

## Testing

```bash
npm test            # unit/integration tests (server + web), ~1 s
npm run test:e2e    # builds the frontend, then runs the Playwright end-to-end suite (~1 min)
npm run test:all    # both
npx playwright test --headed      # (inside e2e/) watch the browser
npx playwright show-report        # (inside e2e/) HTML report after a run
```

First-time setup for the end-to-end tests: `npx playwright install chromium`.

**CI.** `.github/workflows/ci.yml` runs on every push to `main`, on pull requests, and on manual dispatch. It has three parallel jobs: type-check + unit tests + build, the Playwright end-to-end suite (the HTML report and traces are uploaded as an artifact when it fails), and a Docker image build with a container smoke test. CI needs no secrets: the e2e suite uses fake credentials and a fake Twilio.

### End-to-end tests (`e2e/`)

Playwright drives a real Chromium against the real backend and the built frontend. `e2e/support/server.ts` starts two instances:

- **:3101 demo instance:** no Twilio configuration, so only demo mode is available.
- **:3102 "real" instance:** fully configured with fake credentials. The Twilio REST client is replaced by an in-memory fake that records every create-call and hang-up request. The tests play the part of Twilio by sending webhooks signed with `X-Twilio-Signature`, exactly as Twilio does, and they assert on the TwiML the app returns.

Nothing in the suite contacts Twilio or places a phone call. It contains 84 tests (79 desktop + 5 mobile/Pixel 7) covering:

| Spec | What it covers |
|---|---|
| `auth.spec.ts` | Login and logout, wrong password, hardened cookie, session reuse after logout, expired session mid-use, brute-force throttling |
| `form.spec.ts` | Defaults and editing, initial status, button sizes, character limit, server-side number validation and E.164 normalization, input locking, “Escuchar mensaje” preview (es-ES voice, rate, label, unsupported browsers, never calls) |
| `demo.spec.ts` | Missing-config explanation, every simulated scenario (answer, answer without a time, silence → repeat → “No se recibió una respuesta”, busy, no answer), hang-up, call log, reset, SIMULADO labelling, real calls refused on an unconfigured server |
| `real-call.spec.ts` | The full Twilio flow: create-call parameters (E.164, webhooks, 120 s limit), ringing → answer TwiML (pause, Polly es-ES voice, speech Gather after Say) → transcript → thanks + hang-up → completed; silence handling; second-attempt answers; busy, no-answer, and failed statuses; out-of-order callbacks; Colgar while ringing or in conversation; Spanish explanations of provider errors with retry; TwiML escaping; caller ID used as destination |
| `security.spec.ts` | 401 without a session, JSON-only CSRF rule, a cross-site form post can’t call, unsigned/forged/tampered webhooks rejected, foreign CallSid ignored, session isolation, no secrets in responses, security headers, transcripts deleted on logout |
| `resilience.spec.ts` | Double clicks and concurrent requests create exactly one call, the “Iniciando…” state, a second tab blocked then able to hang up, SSE → polling fallback (no EventSource / broken stream), polling stops when the call ends, backend unreachable, SPA fallback, `lang="es"` |
| `mobile.spec.ts` | Single-column layout without horizontal scroll, tap-sized buttons, telephone keypad, a full call by touch without a microphone |

### Unit and integration tests

- `npm test` runs the server tests (phone normalization, TwiML, answer heuristic, auth, duplicate protection, signature validation, full webhook flows, demo + SSE, all with a **mocked** Twilio provider) and the web tests (UI rendering, demo flow, double-click protection).
- **Manual real-call test with a number you own.** Before calling any business, test the real integration with your own mobile:
  1. Configure `server/.env` (all four Twilio variables), start the tunnel, and run `./start.sh` or `npm run dev`.
  2. On a trial account, verify your mobile under *Verified Caller IDs* first.
  3. Untick demo mode, enter your mobile (e.g. `612 34 56 78`), and press **Llamar**.
  4. Answer, say “¿Sí?”, listen to the question, and reply e.g. “Abrimos a las nueve y media”. Then check that the transcript appears and the call ends after the thank-you.
  5. Repeat, staying silent, to check that the question is repeated once and the call ends with “No se recibió una respuesta”.
  6. Try **Colgar** while it rings. Check the call logs in Twilio Console → *Monitor → Logs → Calls* (and the ngrok inspector) if anything fails.
