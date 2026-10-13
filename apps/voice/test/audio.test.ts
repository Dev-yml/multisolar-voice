import { describe, expect, it } from "vitest";
import { frames, mulawSilence, mulawToPcm, parseWav, pcmToMulaw, resample, rms, wavFromPcm } from "../src/audio";

describe("telephone audio", () => {
  it("µ-law round trip stays close to the original", () => {
    const pcm = new Int16Array(800).map((_, i) => Math.round(8000 * Math.sin(i / 5)));
    const back = mulawToPcm(pcmToMulaw(pcm));
    let maxErr = 0;
    for (let i = 0; i < pcm.length; i++) maxErr = Math.max(maxErr, Math.abs(back[i] - pcm[i]) / (Math.abs(pcm[i]) + 64));
    expect(maxErr).toBeLessThan(0.1);
  });
  it("µ-law silence decodes to (near) zero", () => {
    expect(rms(mulawToPcm(mulawSilence(100)))).toBeLessThan(10);
  });
  it("resamples 8 kHz ↔ 16 kHz", () => {
    const pcm = new Int16Array(8000);
    expect(resample(pcm, 8000, 16000).length).toBe(16000);
    expect(resample(resample(pcm, 8000, 24000), 24000, 8000).length).toBe(8000);
  });
  it("writes and reads WAV", () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const { rate, pcm: back } = parseWav(wavFromPcm(pcm, 16000));
    expect(rate).toBe(16000);
    expect(Array.from(back)).toEqual(Array.from(pcm));
  });
  it("splits audio into Smartflo frames (multiples of 160 bytes)", () => {
    const sizes = [...frames(Buffer.alloc(1900, 0xff))].map((f) => f.length);
    expect(sizes).toEqual([800, 800, 320]);
  });
});
