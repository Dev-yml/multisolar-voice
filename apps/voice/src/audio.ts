/**
 * Telephone audio helpers. Smartflo streams G.711 µ-law, 8 kHz, mono (base64).
 * Sarvam listens best at 16 kHz PCM and speaks WAV — these functions convert between them.
 */

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

const DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = (((mantissa << 3) + MULAW_BIAS) << exponent) - MULAW_BIAS;
  DECODE[i] = sign ? -sample : sample;
}

export function mulawToPcm(buf: Uint8Array): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = DECODE[buf[i]];
  return out;
}

function encodeSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample)));
  const sign = s < 0 ? 0x80 : 0;
  if (sign) s = -s;
  if (s > MULAW_CLIP) s = MULAW_CLIP;
  s += MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function pcmToMulaw(pcm: Int16Array): Buffer {
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeSample(pcm[i]);
  return out;
}

/** Linear-interpolation resampler (good enough for speech). */
export function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const len = Math.max(1, Math.round((pcm.length * to) / from));
  const out = new Int16Array(len);
  const step = from / to;
  for (let i = 0; i < len; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const f = pos - i0;
    out[i] = Math.round(pcm[i0] * (1 - f) + pcm[i1] * f);
  }
  return out;
}

export function rms(pcm: Int16Array, start = 0, end = pcm.length): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

export function wavFromPcm(pcm: Int16Array, rate: number): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Reads a WAV file (PCM 16-bit, µ-law or A-law not needed) into mono 16-bit samples. */
export function parseWav(buf: Buffer): { rate: number; pcm: Int16Array } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let off = 12;
  let rate = 0;
  let channels = 1;
  let format = 1;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (size === 0 || body + size > buf.length) size = buf.length - body; // streaming WAVs may leave size 0
      const raw = buf.subarray(body, body + size);
      let pcm: Int16Array;
      if (format === 7) pcm = mulawToPcm(raw);
      else if (format === 1 && bits === 16) pcm = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~1)));
      else throw new Error(`Unsupported WAV format ${format}/${bits}-bit`);
      if (channels > 1) {
        const mono = new Int16Array(Math.floor(pcm.length / channels));
        for (let i = 0; i < mono.length; i++) mono[i] = pcm[i * channels];
        pcm = mono;
      }
      return { rate, pcm };
    }
    off = body + size + (size & 1);
  }
  throw new Error("WAV has no data chunk");
}

/** µ-law silence (0xFF) of the given length, e.g. for simulated speech. */
export function mulawSilence(ms: number): Buffer {
  return Buffer.alloc(Math.round(ms * 8), 0xff);
}

/** Split µ-law audio into 100 ms frames (800 bytes, a multiple of 160 as Smartflo requires). */
export function* frames(buf: Buffer, size = 800): Generator<Buffer> {
  for (let i = 0; i < buf.length; i += size) {
    let f = buf.subarray(i, i + size);
    if (f.length % 160) f = Buffer.concat([f, Buffer.alloc(160 - (f.length % 160), 0xff)]);
    yield f;
  }
}
