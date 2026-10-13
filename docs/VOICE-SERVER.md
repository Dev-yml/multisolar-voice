# Voice Agent server — test, deploy, connect Tata Smartflo

The Voice Agent server (`apps/voice`) is the part that is **on the phone**:

```
Customer's phone ⇄ Tata Smartflo ⇄ Voice Agent server ⇄ Sarvam (listen / speak)
                                        │
                                        └─ agent brain + Supabase (same data as the Console)
```

It also runs the **auto-dialer** (calls consented leads by itself, 09:00–21:00, retries, callbacks).
It must run **24×7 with WebSockets**, so it goes on **Fly.io (Mumbai)** — not on Vercel.

Do the parts in order. Do part A today; B–E once Sarvam and the Smartflo keys are ready.

---

## A. See it work on your laptop (no keys needed)

```bat
cd C:\Projects\multisolar-voice
npm run sim:day
```

10 pretend customers, a fake Tata line, the real dialer and the real agent. In ~30 seconds you see:
calls placed automatically, 3 at a time; Hindi/English conversations; a site visit booked; "call me
tomorrow morning" → callback scheduled; "don't call me" → Do-Not-Call; busy / no answer → retried, then stopped.
Open the Console → **Calls** to read every conversation (they are marked *test*).

> It only touches its own 10 "(sim)" leads. Real leads are never dialled by the simulation.

---

## B. Deploy the server on Fly.io (Mumbai)

1. **fly.io** → sign up with the company Gmail → add a payment card (cost ≈ **$3–5/month** for one always-on small machine).
2. Install the Fly command line — open **PowerShell** once and run:

   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

   Close and reopen Command Prompt, then:

   ```bat
   fly auth login
   cd C:\Projects\multisolar-voice
   fly apps create multisolar-voice-agent
   ```

   If the name is taken, choose another (e.g. `msv-agent-yourname`) and put the same name on the `app = "…"` line of `fly.toml`.
3. Create the server settings file:

   ```bat
   npm run voice:env -- --public https://multisolar-voice-agent.fly.dev
   ```

   (use your app name). This writes `apps\voice\.env` and prints two URLs for Smartflo — keep that window.
4. Open `apps\voice\.env` in Notepad. When you have them, fill in (and remove the `#` in front):
   - `SARVAM_API_KEY=` — from dashboard.sarvam.ai → API Keys
   - `SMARTFLO_API_TOKEN=` and `SMARTFLO_C2C_API_KEY=` — from part C

   Without them the server still runs (simulated phone + silent voice).
   After editing, run `npm run voice:env` again — it keeps your keys and refreshes `apps\voice\.env.fly`.
5. Send the settings to Fly and deploy (builds on Fly's machines — no Docker needed on the laptop):

   ```bat
   type apps\voice\.env.fly | fly secrets import
   fly deploy
   ```

6. Check: open `https://multisolar-voice-agent.fly.dev/health` → `{"ok":true,…}`.
7. **Vercel** (Console) → Settings → Environment Variables → add `VOICE_SERVER_URL` = `https://multisolar-voice-agent.fly.dev` → **Redeploy**.
   The Console dashboard now shows *Phone line / Voice / Dialer*, and each consented lead gets a **📞 Call now** button.

Whenever you change `apps\voice\.env` later: `npm run voice:env` then `type apps\voice\.env.fly | fly secrets import` (Fly restarts the server).
Logs: `fly logs`.

---

## C. Smartflo portal (cloudphone.tatateleservices.com)

Use the two URLs printed by `npm run voice:env` (they contain your private `key=`).

1. **Voice Bot** — *Settings → Channels → Voice Bot → Add an Endpoint*
   - Name: `Multi Solar AI Agent`
   - Endpoint type: **Static URL**
   - URL: the `wss://…/stream?key=…` line → Save → Enable

   If you do not see *Channels / Voice Bot*: ask Tata to enable **Channels Hub / Voice Streaming** on the account
   (see `TATA-SMARTFLO-QUESTIONS.md`).
2. **API token** — *API Connect → API Tokens* → create a token → copy into `SMARTFLO_API_TOKEN=`.
3. **Click-to-call key** — *API Connect → Click to Call Support API → Generate New API Key*
   - In **Destinations** choose the **Voice Bot** from step 1
   - copy the key into `SMARTFLO_C2C_API_KEY=`
4. **Webhook** — *API Connect → Webhook → Add Webhook*
   - Method **POST**, Content-Type **JSON**
   - URL: the `https://…/smartflo/webhook?key=…` line — or, safer, the same URL **without** `?key=…` plus a
     **custom header** `x-msv-key` = your `STREAM_KEY` (keeps the secret out of logs)
   - Events: **Call answered** and **Call hangup (missed or answered)**; call type inbound + outbound
   - Variables to send: `$call_id`, `$ref_id`, `$call_status`, `$recording_url`, `$billsec`, `$duration`, `$hangup_cause`
     — use them as the JSON field names without `$`, e.g.
     `{"call_id":"$call_id","ref_id":"$ref_id","call_status":"$call_status","recording_url":"$recording_url","billsec":"$billsec","hangup_cause":"$hangup_cause"}`
5. Put the new keys on the server: `npm run voice:env` then `type apps\voice\.env.fly | fly secrets import`.

**Inbound (do this last, only when outbound works well):** *My Numbers → 080-6537-8787 → Configure Destination → Voice Bot*.
From then on **every** call to the number is answered by the AI agent. To go back, set the destination to your
agents/queue again.

> The "agent offline when the laptop closes" behaviour is for **human** agents. Calls routed to the Voice Bot do not
> need anyone logged in.

---

## D. First real call — to your own phone

1. Console → **Leads** → add yourself: your mobile, tick *Customer agreed to be called*.
2. Click **📞 Call now** on your lead (between 09:00 and 21:00).
3. Your phone rings from 080-6537-8787. Talk: "Haan ji boliye", "ghar ke liye", "bill teen hazaar", your city…
4. Console → **Calls** → the transcript appears; the recording link arrives with the Smartflo webhook.
5. Try: speaking over the agent (it should stop), staying silent (it asks if you can hear it), Hindi and English.

Tell me what happened (screenshots of the call page + `fly logs`, with keys hidden) and I tune it.

---

## E. Turn on automatic calling

1. Leads → **Import from CSV** (only people who agreed to be called; `consent` column = yes).
2. Agent settings → calling hours, attempts, gap, calls at the same time, monthly budget → tick **Outbound calling on** → Save.
3. The dialer starts within ~15 seconds. Watch Dashboard / Calls. Untick to stop.

---

## Problems

| You see | Fix |
|---|---|
| `fly deploy` fails at `npm ci` | Run `npm install` on the laptop, commit/copy the updated `package-lock.json`, deploy again. |
| `/health` does not open | `fly logs` — usually a missing `DATABASE_URL` / `AGENT_API_KEY`; run `npm run voice:env` and `type apps\voice\.env.fly | fly secrets import`. |
| Call now → "not connected" | `VOICE_SERVER_URL` missing on Vercel, or Vercel not redeployed. |
| Call now → "Smartflo 401/403" | Wrong `SMARTFLO_API_TOKEN` (or expired) — create a new token. |
| Phone rings, then silence / hangs up | Click-to-call key's destination is not the Voice Bot, or the Voice Bot URL/key is wrong. Check `fly logs` for `call … connected`. |
| Agent does not hear you | `SARVAM_API_KEY` missing/wrong (logs show `Sarvam STT 401`). Noisy line: raise `VAD_MIN_RMS` (e.g. 700). |
| Agent cuts in too early / too late | `VAD_END_SILENCE_MS` (default 700) — higher waits longer before answering. |
| Call keeps saying "not answered" | Webhook not set, or the customer did not pick up within 30 s. |
