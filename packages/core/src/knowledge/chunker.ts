/**
 * Semantic chunking: keeps headings with their text, splits on paragraph
 * then sentence boundaries, never mid-sentence, with a one-sentence overlap
 * between consecutive chunks of the same section.
 */

export type Section = { heading?: string; text: string; metadata?: Record<string, unknown> };
export type Chunk = { heading?: string; text: string; metadata?: Record<string, unknown> };

const TARGET = 900;
const HARD_MAX = 1400;

const sentences = (p: string) => p.match(/[^.!?।]+[.!?।]+["')\]]*\s*|[^.!?।]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [p];

export function chunkSections(sections: Section[]): Chunk[] {
  const out: Chunk[] = [];
  for (const s of sections) {
    const text = s.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;
    if (text.length <= TARGET) {
      out.push({ heading: s.heading, text, metadata: s.metadata });
      continue;
    }
    let buf: string[] = [];
    let len = 0;
    const flush = (overlap: boolean) => {
      if (!buf.length) return;
      out.push({ heading: s.heading, text: buf.join(" "), metadata: s.metadata });
      const last = buf[buf.length - 1];
      buf = overlap && last.length < 300 ? [last] : [];
      len = buf.reduce((n, x) => n + x.length + 1, 0);
    };
    for (const para of text.split(/\n\s*\n/)) {
      for (const sentence of sentences(para)) {
        const piece = sentence.length > HARD_MAX ? sentence.slice(0, HARD_MAX) : sentence;
        if (len + piece.length > TARGET && len > 0) flush(true);
        buf.push(piece);
        len += piece.length + 1;
      }
    }
    flush(false);
  }
  return out;
}

/** Split free text (uploads) into sections by markdown/ALL-CAPS headings. */
export function sectionsFromText(text: string, fallbackHeading?: string): Section[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const sections: Section[] = [];
  let heading = fallbackHeading;
  let body: string[] = [];
  const push = () => {
    if (body.join("").trim()) sections.push({ heading, text: body.join("\n") });
    body = [];
  };
  for (const line of lines) {
    const md = line.match(/^#{1,4}\s+(.+)/);
    const caps = !md && line.trim().length > 3 && line.trim().length < 80 && line.trim() === line.trim().toUpperCase() && /[A-Z]/.test(line);
    if (md || caps) {
      push();
      heading = (md ? md[1] : line).trim();
    } else body.push(line);
  }
  push();
  return sections;
}
