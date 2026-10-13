#!/usr/bin/env node
/**
 * One-time setup for Multi Solar Voice on a new computer (Windows, macOS or Linux).
 *
 *   npm run setup
 *
 * 1. checks Node.js, installs packages if needed
 * 2. asks for your Supabase connection strings and writes apps/console/.env with fresh secrets
 * 3. creates the tables in Supabase and loads starting data
 *
 * Safe to run again: an existing .env is kept (use `npm run setup -- --reset-env` to rewrite it).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const consoleDir = join(root, "apps", "console");
const envPath = join(consoleDir, ".env");
const resetEnv = process.argv.includes("--reset-env");

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function run(cmd, cwd = root) {
  console.log(`\n> ${cmd}`);
  // shell: true so npm/npx resolve to npm.cmd/npx.cmd on Windows.
  const r = spawnSync(cmd, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(red(`\n✗ Failed: ${cmd}`));
    process.exit(r.status ?? 1);
  }
}

/** Answers piped in (non-interactive runs, e.g. CI): one per line. */
let piped = null;
async function pipedAnswers() {
  if (piped) return piped;
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  piped = data.split(/\r?\n/);
  return piped;
}

async function ask(question, { fallback = "", hidden = false } = {}) {
  if (!process.stdin.isTTY) {
    const answer = ((await pipedAnswers()).shift() ?? "").trim();
    console.log(`${question}: ${hidden ? "********" : answer || fallback}`);
    return answer || fallback;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Print the prompt, then echo nothing while the password is typed.
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
  }
  const label = fallback && !hidden ? `${question} [${fallback}]: ` : `${question}: `;
  return new Promise((resolve) =>
    rl.question(label, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim() || fallback);
    }),
  );
}

const secret = (bytes = 36) => randomBytes(bytes).toString("base64url");
/** Readable password without look-alike characters. */
function password(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = randomBytes(len);
  return Array.from(b, (x) => chars[x % chars.length]).join("");
}

async function main() {
  console.log(bold("\nMulti Solar Voice — setup\n"));

  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.error(red(`Node.js ${process.versions.node} is too old. Install Node.js 22 LTS (22.12 or newer) from https://nodejs.org`));
    process.exit(1);
  }
  console.log(green(`✓ Node.js ${process.versions.node}`));

  if (!existsSync(join(root, "node_modules", "next")) && !existsSync(join(consoleDir, "node_modules", "next"))) {
    console.log("Installing packages (first time takes a few minutes)…");
    run("npm install");
  } else console.log(green("✓ packages installed"));

  let adminPassword = null;
  if (existsSync(envPath) && !resetEnv) {
    console.log(green("✓ apps/console/.env already exists — keeping it"));
  } else {
    console.log("\nOpen Supabase → your project → Connect → ORMs → Prisma.");
    console.log("Copy the two connection strings shown there (they contain [YOUR-PASSWORD]).");
    console.log(yellow("Everything you type stays in apps/console/.env on this computer.\n"));
    let appUrl = await ask("1) Transaction pooler URL (port 6543)");
    let migUrl = await ask("2) Session pooler / direct URL (port 5432)");
    const pass = await ask("3) Supabase database password (hidden)", { hidden: true });
    const adminEmail = (await ask("Your login email for the Voice Console", { fallback: "admin@multisolar-voice.test" })).toLowerCase();
    const adminName = await ask("Your name", { fallback: "IT Admin" });
    adminPassword = password();

    const fill = (u) => u.trim().replace(/^"|"$/g, "").replace(/^DATABASE_URL=|^DIRECT_URL=/, "").replace(/^"|"$/g, "")
      .replace("[YOUR-PASSWORD]", encodeURIComponent(pass));
    appUrl = fill(appUrl);
    migUrl = fill(migUrl);
    if (!/^postgres(ql)?:\/\//.test(appUrl) || !/^postgres(ql)?:\/\//.test(migUrl)) {
      console.error(red("Both URLs must start with postgresql:// — copy them again from Supabase → Connect."));
      process.exit(1);
    }
    if (appUrl.includes(":6543") && !appUrl.includes("pgbouncer=true")) appUrl += (appUrl.includes("?") ? "&" : "?") + "pgbouncer=true";
    if (!appUrl.includes("connection_limit=")) appUrl += (appUrl.includes("?") ? "&" : "?") + "connection_limit=1";
    const example = readFileSync(join(root, ".env.example"), "utf8");
    const env = example
      .replace(/^# Copy to apps\/console\/\.env.*$/m, `# Created by npm run setup on ${new Date().toISOString().slice(0, 10)}. Never commit or share this file.`)
      .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${appUrl}"`)
      .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL="${migUrl}"`)
      .replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret()}"`)
      .replace(/^AGENT_API_KEY=.*$/m, `AGENT_API_KEY="${secret()}"`)
      .replace(/^SEED_ADMIN_NAME=.*$/m, `SEED_ADMIN_NAME="${adminName.replace(/"/g, "")}"`)
      .replace(/^SEED_ADMIN_EMAIL=.*$/m, `SEED_ADMIN_EMAIL="${adminEmail}"`)
      .replace(/^SEED_ADMIN_PASSWORD=.*$/m, `SEED_ADMIN_PASSWORD="${adminPassword}"`);
    writeFileSync(envPath, env);
    try {
      chmodSync(envPath, 0o600);
    } catch {
      /* Windows: file permissions are managed by the user account */
    }
    console.log(green("✓ wrote apps/console/.env"));
  }

  console.log("\nCreating the tables in Supabase…");
  run("npx prisma migrate deploy", consoleDir);
  console.log("\nLocking the tables against Supabase's public API (row level security)…");
  run("npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma", consoleDir);
  run("npx prisma generate", consoleDir);
  console.log("\nLoading starting data (size guide, sample prices, subsidy rule, website knowledge, admin user)…");
  run("npx prisma db seed", consoleDir);

  const env = readFileSync(envPath, "utf8");
  const email = env.match(/^SEED_ADMIN_EMAIL="?([^"\n]*)"?/m)?.[1];
  console.log(bold(green("\n✓ Setup complete\n")));
  console.log(`Start the Voice Console:   ${bold("npm run dev")}`);
  console.log(`Then open:                 ${bold("http://localhost:3001")}`);
  console.log(`Sign in with:              ${bold(email ?? "(SEED_ADMIN_EMAIL in apps/console/.env)")}`);
  if (adminPassword) {
    console.log(`Password (shown once):     ${bold(adminPassword)}`);
    console.log(yellow("Save it in a password manager. It is also in apps/console/.env as SEED_ADMIN_PASSWORD."));
  } else console.log("Password:                  SEED_ADMIN_PASSWORD in apps/console/.env");
  console.log(`\nFor Vercel, copy these four values from apps/console/.env into Project → Settings → Environment Variables:`);
  console.log("  DATABASE_URL, DIRECT_URL, AUTH_SECRET, AGENT_API_KEY\n");
}

main().catch((e) => {
  console.error(red(e?.stack ?? String(e)));
  process.exit(1);
});
