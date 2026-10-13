import { assertConfig, config, wsBase } from "./config";
import { dialerFromConfig } from "./dialer";
import { SmartfloLine, type PhoneLine } from "./phone-line";
import { speechProviders } from "./providers/speech";
import { createVoiceServer } from "./server";
import { SimulatedLine } from "./sim/fake-smartflo";

const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

const problems = assertConfig();
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

const sim = config.smartflo.mode === "sim";
const speech = speechProviders();
const line: PhoneLine = sim ? new SimulatedLine({ log }) : new SmartfloLine();
const dialer = config.dialer.enabled ? dialerFromConfig(line, log) : undefined;
const server = createVoiceServer({ stt: speech.stt, tts: speech.tts, line, dialer, sim, log });

server.listen(config.port, () => {
  log(`Multi Solar Voice Agent on :${config.port} — phone line: ${line.name}, speech: ${speech.name}, dialer: ${dialer ? "on" : "off"}`);
  log(`Smartflo Voice Bot (static) URL: ${wsBase()}/stream?key=<STREAM_KEY>`);
  dialer?.start();
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    log("shutting down");
    dialer?.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
