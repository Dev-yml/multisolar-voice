#!/usr/bin/env node
/**
 * Creates apps/voice/.env (Voice Agent server settings) from apps/console/.env.
 *
 *   npm run voice:env                                  # local
 *   npm run voice:env -- --public https://<app>.fly.dev # for the deployed server
 *
 * Keeps any values already in apps/voice/.env (Sarvam / Smartflo keys you added) — so after adding
 * keys, run it again to refresh apps/voice/.env.fly (the file you send to Fly).
 * Then prints exactly what to paste into the Smartflo portal.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const consoleEnv = join(root, "apps", "console", ".env");
const voiceEnv = join(root, "apps", "voice", ".env");

const parse = (file) => {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
};

if (!existsSync(consoleEnv)) {
  console.error("apps/console/.env not found — run `npm run setup` first.");
  process.exit(1);
}
const c = parse(consoleEnv);
const v = parse(voiceEnv);
const arg = process.argv.indexOf("--public");
const publicUrl = (arg > 0 ? process.argv[arg + 1] : v.PUBLIC_URL || "http://localhost:8080").replace(/\/$/, "");

// The voice server is long-running: use the session pooler (5432) with a small pool.
// (Locally, keep the console's URL.)
let db = c.DATABASE_URL;
if (c.DIRECT_URL && !/localhost|127\.0\.0\.1/.test(c.DIRECT_URL)) {
  db = c.DIRECT_URL + (c.DIRECT_URL.includes("?") ? "&" : "?") + "connection_limit=5";
}

const values = {
  DATABASE_URL: db,
  AGENT_API_KEY: c.AGENT_API_KEY,
  PUBLIC_URL: publicUrl,
  STREAM_KEY: v.STREAM_KEY || randomBytes(24).toString("base64url"),
  SARVAM_API_KEY: v.SARVAM_API_KEY ?? "",
  SMARTFLO_API_TOKEN: v.SMARTFLO_API_TOKEN ?? "",
  SMARTFLO_C2C_API_KEY: v.SMARTFLO_C2C_API_KEY ?? "",
  SMARTFLO_CALLER_ID: v.SMARTFLO_CALLER_ID || "918065378787",
};

const body = [
  `# Voice Agent server — created by npm run voice:env on ${new Date().toISOString().slice(0, 10)}. Never commit or share.`,
  // Unquoted on purpose: works for Node (--env-file) and for `fly secrets import`.
  // Empty keys stay commented out (fly secrets import rejects empty values): fill in, then remove the #.
  ...Object.entries(values).map(([k, val]) => (val ? `${k}=${val}` : `# ${k}=`)),
  "",
].join("\n");
writeFileSync(voiceEnv, body);
// Same values, no comments or empty lines — for: type apps\voice\.env.fly | fly secrets import
const flyFile = join(root, "apps", "voice", ".env.fly");
writeFileSync(flyFile, Object.entries(values).filter(([, val]) => val).map(([k, val]) => `${k}=${val}`).join("\n") + "\n");
for (const f of [voiceEnv, flyFile]) {
  try {
    chmodSync(f, 0o600);
  } catch {
    /* Windows */
  }
}

const ws = publicUrl.replace(/^http/, "ws");
console.log(`\n✓ wrote apps/voice/.env and apps/voice/.env.fly  (PUBLIC_URL = ${publicUrl})\n`);
console.log("Paste into the Smartflo portal (keep these private):\n");
console.log("  Settings → Channels → Voice Bot → Add an Endpoint → Static URL:");
console.log(`    ${ws}/stream?key=${values.STREAM_KEY}\n`);
console.log("  API Connect → Webhook → Add Webhook → URL (POST, JSON):");
console.log(`    ${publicUrl}/smartflo/webhook?key=${values.STREAM_KEY}\n`);
if (!values.SARVAM_API_KEY) console.log("  • SARVAM_API_KEY is empty — add it to apps/voice/.env (speech is simulated until then).");
if (!values.SMARTFLO_API_TOKEN || !values.SMARTFLO_C2C_API_KEY)
  console.log("  • SMARTFLO_API_TOKEN / SMARTFLO_C2C_API_KEY are empty — the phone line is simulated until you add them.");
console.log("");
