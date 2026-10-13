import { Bm25Index, chunkSections, type KnowledgeHit } from "@msv/core";
import { prisma } from "./db";
import { extractText, kindFromName, toSections } from "./loaders";

/**
 * Knowledge base for the agent: uploaded documents → passages → keyword
 * search (BM25, Hindi/Hinglish aware). Prices and subsidies are NOT here;
 * they live in their own tables so the numbers are exact.
 */

type Item = { id: number; heading: string | null; text: string; title: string };
let cache: { at: number; index: Bm25Index<Item> } | null = null;
const TTL = 60_000;

export function invalidateKnowledge() {
  cache = null;
}

async function index() {
  if (cache && Date.now() - cache.at < TTL) return cache.index;
  const rows = await prisma.knowledgeChunk.findMany({
    where: { document: { status: "ACTIVE" } },
    select: { id: true, heading: true, text: true, document: { select: { title: true } } },
  });
  const idx = new Bm25Index<Item>(rows.map((r) => ({ id: r.id, heading: r.heading, text: r.text, title: r.document.title })));
  cache = { at: Date.now(), index: idx };
  return idx;
}

export async function searchKnowledge(question: string, limit = 3): Promise<KnowledgeHit[]> {
  const idx = await index();
  return idx.search(question, limit).map((h) => ({ title: h.item.title, heading: h.item.heading, text: h.item.text, score: h.score, confidence: h.matched }));
}

export async function ingestText(input: { title: string; category: string; version: string; text: string; fileName?: string; userId?: number; kind?: ReturnType<typeof kindFromName> }) {
  const sections = toSections(input.kind ?? "txt", input.text, input.title);
  const chunks = chunkSections(sections);
  if (!chunks.length) throw new Error("No readable text found in this file. Scanned PDFs (photos of pages) cannot be read.");
  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: input.title,
      category: input.category,
      version: input.version,
      fileName: input.fileName,
      uploadedById: input.userId,
      chunks: { create: chunks.map((c, i) => ({ ordinal: i, heading: c.heading?.slice(0, 200) ?? null, text: c.text })) },
    },
    include: { _count: { select: { chunks: true } } },
  });
  invalidateKnowledge();
  return doc;
}

export async function ingestFile(file: File, meta: { title: string; category: string; version: string; userId?: number }) {
  const kind = kindFromName(file.name, file.type);
  if (!kind) throw new Error("Unsupported file. Use PDF, Word (.docx), TXT, Markdown, CSV or JSON.");
  const text = await extractText(kind, Buffer.from(await file.arrayBuffer()));
  return ingestText({ ...meta, text, fileName: file.name, kind });
}
