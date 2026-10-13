# Windows quick start (with two-factor sign-in)

Use **PowerShell** and type `npm.cmd` (not `npm`).

## 1. Put the new version in place
1. Close VS Code / Explorer windows of the old folder and stop `npm run dev` (Ctrl + C).
2. If `C:\Projects\multisolar-voice` exists and has `apps\console\.env`, copy that file to the Desktop first.
3. Rename the old folder to `multisolar-voice-old`.
4. Right-click the zip → **Extract All…** → `C:\Projects` → you get `C:\Projects\multisolar-voice`.
5. Copy the saved `.env` back into `C:\Projects\multisolar-voice\apps\console\` (skip if you never had one).

## 2. Install and set up
```powershell
cd C:\Projects\multisolar-voice
npm.cmd install
npm.cmd run setup
```
- With a `.env`: setup updates the Supabase tables (adds two-factor sign-in) — no questions.
- Without: create the Supabase project first (WINDOWS-SETUP.md, part A), then paste the 6543 line, the 5432 line and the database password.
- Setup prints your console password once — save it.

## 3. Start and sign in
```powershell
npm.cmd run dev
```
Open http://localhost:3001.
1. Email + password.
2. **First time:** the "Set up two-factor sign-in" page opens.
   - Install **Google Authenticator** or **Microsoft Authenticator** on your phone.
   - **Start setup** → scan the QR code (or type the setup key).
   - Type the 6-digit code → **Turn on**.
   - **Save the 8 recovery codes** (Download / Copy). Each works once if you lose the phone.
3. **Every next sign-in:** password, then the 6-digit code from the app.
4. Change the starting password: click your name (bottom of the sidebar) → **My account**. Then delete the `SEED_ADMIN_PASSWORD` line from `apps\console\.env`.

## 4. Fast mode (use this every day)
`npm.cmd run dev` is **developer mode**: every page is compiled the first time you open it, so clicks feel slow.
For normal use, run the finished (production) version — pages open instantly:
```powershell
npm.cmd run fast
```
Stop `npm.cmd run dev` first (Ctrl+C). It builds once (2–3 minutes), then starts on http://localhost:3001. After you change code or get a new zip, run it again.
Online on Vercel the console always runs in this fast mode.

## 5. Natural voice in Test call
- **Best:** add your Sarvam key to `apps\console\.env` → `SARVAM_API_KEY=...` → restart. Test call → Voice: **Sarvam AI** (same voice as phone calls).
- **Free:** open the console in **Microsoft Edge** and pick a voice with "Online (Natural)" in its name (Hindi: Swara/Madhur, English: Neerja/Prabhat). Chrome: pick "Google हिन्दी". Avoid Kalpana/Hemant/Heera/Ravi (robotic).

## 6. Optional demo data
```powershell
npm.cmd run sim:day
```

## Problems
| You see | Fix |
|---|---|
| "That code is not right" | Phone time must be automatic (Settings → Date & time → set automatically). Use the newest code. |
| "Too many wrong codes" | Wait 15 minutes. |
| Lost phone | Use a recovery code, or ask a Super Admin: **Users → Reset two-factor**. |
| Only admin lost phone *and* codes | On the laptop: `npm.cmd run mfa:reset -- your@email.com` |
| `running scripts is disabled` | Use `npm.cmd` instead of `npm`. |
| Pages slow | Use `npm.cmd run fast` (section 4). Check Supabase region is **Mumbai** (Project Settings → General). |
| Folder "in use" | Close VS Code/Explorer on it, or extract the zip to a new folder. |

Never put `.env` files on GitHub, WhatsApp or email.
