import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { searchKnowledge } from "@/lib/knowledge";
import { MANAGERS } from "@/lib/roles";
import { formatDate } from "@/lib/util";
import { ActionForm } from "../ActionForm";
import { setDocumentStatus, uploadKnowledge } from "../actions";
import { Badge, Card, Empty, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const canEdit = MANAGERS.includes(user.role);
  const { q } = await searchParams;
  const [docs, hits] = await Promise.all([
    prisma.knowledgeDocument.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { chunks: true } }, uploadedBy: { select: { name: true } } } }),
    q ? searchKnowledge(q, 5) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageTitle title="Knowledge" sub="What the agent may say about products, warranty, process and FAQs. Prices and subsidy are on their own page so numbers stay exact. If nothing here answers a question, the agent promises a sales callback instead of guessing." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Ask like a customer</h2>
          <p className="mt-1 text-sm text-muted">See what the agent would find. It answers only when the match is 50% or more.</p>
          <form className="mt-3 flex gap-2"><input name="q" defaultValue={q} placeholder="e.g. panel ki warranty kitni hai?" className="input" /><button className="btn">Search</button></form>
          {q && (hits.length ? (
            <ul className="mt-4 space-y-3">
              {hits.map((h, i) => (
                <li key={i} className="rounded-lg border border-line/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{h.title}{h.heading && h.heading !== h.title ? ` › ${h.heading}` : ""}</span><Badge tone={h.confidence >= 0.5 ? "green" : "amber"}>{Math.round(h.confidence * 100)}% match</Badge></div>
                  <p className="mt-1 line-clamp-4 text-muted">{h.text}</p>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-sm text-muted">Nothing found — the agent would escalate this to sales.</p>)}
        </Card>
        {canEdit && (
          <Card>
            <h2 className="font-semibold">Add a document</h2>
            <p className="mt-1 text-sm text-muted">PDF, Word (.docx), TXT, Markdown, CSV or JSON — or paste text. Only add approved company information.</p>
            <ActionForm action={uploadKnowledge} submit="Add to knowledge" resetOnOk className="mt-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <input name="title" required placeholder="Title" className="input sm:col-span-3" />
                <select name="category" className="input" defaultValue="product"><option value="product">Product</option><option value="warranty">Warranty</option><option value="process">Process</option><option value="faq">FAQ</option><option value="policy">Policy</option><option value="general">General</option></select>
                <input name="version" placeholder="Version / date" className="input sm:col-span-2" />
              </div>
              <input type="file" name="file" accept=".pdf,.docx,.txt,.md,.csv,.json" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone file:px-3 file:py-2" />
              <textarea name="text" rows={4} placeholder="…or paste text here" className="input mt-2" />
            </ActionForm>
          </Card>
        )}
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Documents</h2>
      {docs.length ? (
        <Card flush className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>Category</th><th>Version</th><th>Passages</th><th>Added</th><th>Status</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="font-medium">{d.title}{d.fileName && <div className="text-xs font-normal text-muted">{d.fileName}</div>}</td>
                  <td>{d.category}</td><td>{d.version}</td><td className="tabular-nums">{d._count.chunks}</td>
                  <td className="whitespace-nowrap">{formatDate(d.createdAt)}<div className="text-xs text-muted">{d.uploadedBy?.name ?? "seed"}</div></td>
                  <td>{d.status === "ACTIVE" ? <Badge tone="green">in use</Badge> : <Badge>archived</Badge>}</td>
                  {canEdit && (
                    <td>
                      <form action={setDocumentStatus}>
                        <input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value={d.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                        <button className="text-sm text-accent-ink underline underline-offset-4">{d.status === "ACTIVE" ? "Archive" : "Restore"}</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : <Empty>No documents yet.</Empty>}
    </>
  );
}
