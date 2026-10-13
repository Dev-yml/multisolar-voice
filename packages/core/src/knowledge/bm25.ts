import { tokenize } from "./tokenize";

/** Okapi BM25 over a small in-memory corpus (the company KB is hundreds of chunks, not millions). */
export class Bm25Index<T extends { id: number; text: string; heading?: string | null }> {
  private docs: { item: T; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;
  constructor(items: T[], private k1 = 1.4, private b = 0.72) {
    for (const item of items) {
      // Headings are weighted (repeated) — they carry the topic.
      const tokens = tokenize(`${item.heading ?? ""} ${item.heading ?? ""} ${item.text}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ item, tf, len: tokens.length });
    }
    this.avgLen = this.docs.reduce((n, d) => n + d.len, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, limit = 20): { item: T; score: number; matched: number }[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.docs.length;
    const scored = this.docs.map((d) => {
      let score = 0;
      let matched = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched++;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen)));
      }
      return { item: d.item, score, matched: matched / q.length };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
