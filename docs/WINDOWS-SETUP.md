# Multi Solar Voice — setup on Windows + Supabase + Vercel

Time: about 30–40 minutes the first time. Do the parts in order.
Use the **company Gmail** for every account (Supabase, Vercel, GitHub, Sarvam).

| Part | What | Where |
|---|---|---|
| A | Create the database | supabase.com |
| B | Run the console on your laptop, connected to Supabase | Windows |
| C | Put the code in a private GitHub repo | github.com |
| D | Put the console online | vercel.com |
| E | Sarvam API key (for the voice) | sarvam.ai |
| F | Phone calls: Voice Agent server + Smartflo | `docs/VOICE-SERVER.md` |

> Passwords and keys go **only** into `apps/console/.env` (your laptop) and Vercel's settings.
> Never in chat, email, WhatsApp, or GitHub.

---

## A. Supabase (database)

1. Go to **supabase.com** → **Start your project** → sign in with the company Gmail.
2. **New project**
   - Organization: create one, e.g. `Multi Solar`
   - Project name: `multisolar-voice`
   - Database password: click **Generate a password** → **copy it into a password manager / a safe note**. You need it in step B.
   - Region: **South Asia (Mumbai)** — closest to India and to Vercel's Mumbai region.
   - **Create new project** and wait ~2 minutes.
3. When it is ready, click **Connect** (top of the project page) → tab **ORMs** → choose **Prisma**.
   You will see two lines:
   - `DATABASE_URL=…pooler.supabase.com:6543/postgres?pgbouncer=true` ← **Transaction pooler**
   - `DIRECT_URL=…pooler.supabase.com:5432/postgres` ← **Session pooler**

   Keep this page open — you paste both lines in step B. They contain `[YOUR-PASSWORD]`; the setup fills in the password for you.

> This is a **new, separate** database. The Multi Solar website and its database are not touched.

---

## B. Run it on your laptop (Windows)

1. Copy `multisolar-voice-<date>.zip` to the laptop → right-click → **Extract All…** → to `C:\Projects\multisolar-voice`
   (next to the website folder, but separate).
2. Open **Command Prompt** (not PowerShell):

   ```bat
   cd C:\Projects\multisolar-voice
   node -v
   npm run setup
   ```

   `node -v` must show **v22.12 or newer**.
3. The setup asks:

   | Question | Answer |
   |---|---|
   | 1) Transaction pooler URL (port 6543) | paste the `DATABASE_URL` line from Supabase |
   | 2) Session pooler URL (port 5432) | paste the `DIRECT_URL` line |
   | 3) Supabase database password | the password from step A2 (typing is hidden) |
   | Login email | your company email |
   | Your name | your name |

   It installs packages, creates all tables in Supabase, loads the starting data (size guide, sample prices,
   PM Surya Ghar rule, website knowledge, your admin login) and **prints your console password once** — save it.
4. Start:

   ```bat
   npm run dev
   ```

   Open **http://localhost:3001** → sign in → **Test call** → *Start call*.
5. Check Supabase: **Table Editor** now shows tables like `Lead`, `Call`, `CallTurn`. A test call you make appears there.

The old MySQL on the laptop is **not needed** any more for this project.

---

## C. Private GitHub repo

1. github.com → **New repository** → name `multisolar-voice` → **Private** → Create.
2. In Command Prompt:

   ```bat
   cd C:\Projects\multisolar-voice
   git init
   git add .
   git status
   ```

   **Check:** `apps/console/.env` must **not** be in the list (it is ignored on purpose). If it appears, stop.

   ```bat
   git commit -m "Multi Solar Voice: console + agent (Supabase)"
   git branch -M main
   git remote add origin https://github.com/<your-account>/multisolar-voice.git
   git push -u origin main
   ```

---

## D. Vercel (console online)

1. vercel.com → sign in with GitHub (company account) → **Add New… → Project** → import `multisolar-voice`.
2. Settings on the import screen:
   - **Root Directory:** `apps/console`  ← important
   - Framework: Next.js (auto)
   - Build / Install commands: leave default
3. **Environment Variables** — open `C:\Projects\multisolar-voice\apps\console\.env` in Notepad and copy these **four** (name and value):
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `AUTH_SECRET`
   - `AGENT_API_KEY`

   (Do not add the `SEED_ADMIN_…` lines.)
4. **Deploy**. After ~2 minutes you get a link like `multisolar-voice.vercel.app` → sign in with the same email/password.
5. Later, a nicer address: Vercel → Project → **Domains** → `voice.multisolar.in` (needs one DNS record from whoever manages multisolar.in).

**Plans:** Vercel's free *Hobby* plan is for personal/non-commercial use — for company use take **Pro**.
Supabase's free project **pauses after 7 days without activity**; move to **Pro** before going live.

---

## E. Sarvam (voice) — get the key ready

1. dashboard.sarvam.ai → sign up with the company Gmail (₹100 free credit).
2. **API Keys** → create a key → save it in the password manager.
3. Keep it — it goes into `.env` and the server settings when we connect the phone voice. **Do not send it in chat.**

---

## F. Phone calls — the Voice Agent server

Next guide: **`docs/VOICE-SERVER.md`**
1. `npm run sim:day` — watch 10 simulated customers being called automatically (no keys needed).
2. Deploy the Voice Agent server on Fly.io (Mumbai) — always-on, ~$3–5/month.
3. Connect Smartflo (Voice Bot, API token, Click-to-Call key, webhook) and Sarvam.
4. First real call to your own phone with **📞 Call now**.

---

## Problems

| You see | Fix |
|---|---|
| `running scripts is disabled on this system` | Use **Command Prompt**, not PowerShell. |
| `P1001: Can't reach database server` | Wrong URL copied, or Supabase project still starting / paused (Dashboard → *Restore*). Run `npm run setup -- --reset-env`. |
| `password authentication failed` | Wrong database password. Supabase → Project Settings → Database → *Reset database password*, then `npm run setup -- --reset-env`. |
| `prepared statement "s0" already exists` | The 6543 URL is missing `?pgbouncer=true`. Re-run `npm run setup -- --reset-env`. |
| Vercel build fails at `@msv/core` | Root Directory must be `apps/console` (and "Include files outside the root directory" left on). |
| Vercel page says *Application error* | An environment variable is missing — re-check the four values, then **Redeploy**. |
| `Port 3001 is in use` | Close the other app, or change `-p 3001` in `apps/console/package.json`. |
