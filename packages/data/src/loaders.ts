import { sectionsFromText, type Section } from "@msv/core";

/**
 * File loaders for knowledge uploads: PDF, DOCX, TXT, Markdown, CSV, JSON.
 * Heavy parsers are imported lazily so they never load on normal requests.
 */

export const SUPPORTED_UPLOADS = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
} as const;

export type UploadKind = (typeof SUPPORTED_UPLOADS)[keyof typeof SUPPORTED_UPLOADS];

export function kindFromName(fileName: string, mime?: string): UploadKind | null {
  if (mime && mime in SUPPORTED_UPLOADS) return SUPPORTED_UPLOADS[mime as keyof typeof SUPPORTED_UPLOADS];
  const ext = fileName.toLowerCase().split(".").pop();
  const map: Record<string, UploadKind> = { pdf: "pdf", docx: "docx", txt: "txt", md: "md", markdown: "md", csv: "csv", json: "json" };
  return (ext && map[ext]) || null;
}

export async function extractText(kind: UploadKind, buf: Buffer): Promise<string> {
  switch (kind) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
      const { text } = await pdfText(pdf, { mergePages: false });
      return (Array.isArray(text) ? text : [text]).join("\n\n");
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return value;
    }
    default:
      return buf.toString("utf8");
  }
}

/** Turn extracted content into sections (structure-aware for CSV/JSON). */
export function toSections(kind: UploadKind, raw: string, title: string): Section[] {
  if (kind === "csv") {
    const rows = parseCsv(raw);
    const [header, ...data] = rows;
    if (!header) return [];
    return data
      .filter((r) => r.some((c) => c.trim()))
      .map((r) => ({
        heading: r[0] ? `${title} — ${r[0]}` : title,
        text: header.map((h, i) => (r[i] ? `${h}: ${r[i]}` : "")).filter(Boolean).join("\n"),
      }));
  }
  if (kind === "json") {
    try {
      const data = JSON.parse(raw) as unknown;
      const items = Array.isArray(data) ? data : [data];
      return items.map((item, i) => ({ heading: `${title} — item ${i + 1}`, text: flatten(item).join("\n") }));
    } catch {
      return sectionsFromText(raw, title);
    }
  }
  return sectionsFromText(raw, title);
}

function flatten(v: unknown, prefix = ""): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v !== "object") return [`${prefix}${String(v)}`];
  if (Array.isArray(v)) return v.flatMap((x) => flatten(x, prefix));
  return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) =>
    typeof x === "object" && x !== null ? flatten(x, `${prefix}${k} › `) : [`${prefix}${k}: ${String(x)}`],
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
