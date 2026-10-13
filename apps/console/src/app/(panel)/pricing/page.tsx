import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { MANAGERS } from "@/lib/roles";
import { inr } from "@/lib/util";
import { ActionForm } from "../ActionForm";
import { deletePrice, savePrice, saveSizing, saveSubsidy } from "../actions";
import { Badge, Card, PageTitle, SEGMENT_LABEL } from "../ui";

export const metadata: Metadata = { title: "Prices & subsidy" };

const Num = (p: { name: string; label: string; value?: number | null; step?: string }) => (
  <label className="text-xs text-muted">{p.label}<input name={p.name} defaultValue={p.value ?? ""} inputMode="decimal" step={p.step} className="input mt-1 text-ink" required /></label>
);

export default async function PricingPage() {
  await requireUser(MANAGERS);
  const [prices, sizing, rules] = await Promise.all([
    prisma.priceRow.findMany({ orderBy: [{ segment: "asc" }, { kw: "asc" }] }),
    prisma.sizingRow.findMany({ orderBy: { kw: "asc" } }),
    prisma.subsidyRule.findMany({ orderBy: { id: "asc" } }),
  ]);
  const sample = prices.some((p) => p.sample);

  return (
    <>
      <PageTitle title="Prices & subsidy" sub="The agent speaks only these numbers. It never invents a price: if a size isn't listed, it says sales will send a custom quote." />
      {sample && <p className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Rows marked <b>sample</b> come from the public website size guide. Replace them with the official price sheet and untick “sample”.</p>}

      <Card>
        <h2 className="font-semibold">Price sheet</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Type</th><th>Size</th><th>Price range</th><th>GST</th><th /><th /></tr></thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id}>
                  <td>{SEGMENT_LABEL[p.segment]}</td><td className="tabular-nums">{p.kw} kW</td>
                  <td className="tabular-nums">{inr(p.priceMin)} – {inr(p.priceMax)}</td>
                  <td>{p.includesGst ? "incl." : "extra"}</td>
                  <td>{p.sample ? <Badge tone="amber">sample</Badge> : <Badge tone="green">official</Badge>}</td>
                  <td><form action={deletePrice}><input type="hidden" name="id" value={p.id} /><button className="text-sm text-danger underline underline-offset-4">Remove</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent-ink">Add or change a price (same type + size overwrites)</summary>
          <ActionForm action={savePrice} className="mt-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="text-xs text-muted">Type<select name="segment" className="input mt-1 text-ink"><option value="RESIDENTIAL">Home</option><option value="COMMERCIAL">Business</option><option value="INDUSTRIAL">Factory</option></select></label>
              <Num name="kw" label="Size (kW)" />
              <Num name="priceMin" label="From ₹" />
              <Num name="priceMax" label="To ₹" />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="includesGst" defaultChecked /> Includes GST</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="sample" /> Sample (not official yet)</label>
            </div>
            <input name="note" placeholder="Note (optional)" className="input mt-2" />
          </ActionForm>
        </details>
      </Card>

      <Card className="mt-5">
        <h2 className="font-semibold">Size guide (bill → system size)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table">
            <thead><tr><th>Size</th><th>Monthly bill</th><th>Roof area</th><th>Units / month</th></tr></thead>
            <tbody>{sizing.map((s) => <tr key={s.id}><td>{s.kw} kW</td><td className="tabular-nums">{inr(s.billMin)} – {inr(s.billMax)}</td><td>{s.roofSqftMin}–{s.roofSqftMax} sq ft</td><td>{s.unitsMin}–{s.unitsMax}</td></tr>)}</tbody>
          </table>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent-ink">Add or change a size</summary>
          <ActionForm action={saveSizing} className="mt-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <Num name="kw" label="Size (kW)" /><Num name="billMin" label="Bill from ₹" /><Num name="billMax" label="Bill to ₹" /><span />
              <Num name="roofSqftMin" label="Roof from (sq ft)" /><Num name="roofSqftMax" label="Roof to (sq ft)" /><Num name="unitsMin" label="Units from" /><Num name="unitsMax" label="Units to" />
            </div>
          </ActionForm>
        </details>
      </Card>

      <Card className="mt-5">
        <h2 className="font-semibold">Subsidy rules</h2>
        <p className="mt-1 text-sm text-muted">Home (residential) rooftop only. State top-ups apply when the caller&apos;s city/state text matches the state name.</p>
        <div className="mt-3 space-y-4">
          {[...rules, null].map((r) => (
            <details key={r?.id ?? "new"} className="rounded-xl border border-line/70 p-4" open={!r && rules.length === 0}>
              <summary className="cursor-pointer text-sm font-medium">
                {r ? <>{r.name} — {inr(r.perKwFirst)}/kW for first {r.firstKw} kW{r.perKwNext ? `, ${inr(r.perKwNext)} for next ${r.nextKw} kW` : ""}, max {inr(r.cap)} {r.active ? <Badge tone="green">active</Badge> : <Badge>off</Badge>}</> : <span className="text-accent-ink">+ Add a state subsidy rule</span>}
              </summary>
              <ActionForm action={saveSubsidy} className="mt-3">
                <input type="hidden" name="id" value={r?.id ?? 0} />
                <div className="grid gap-2 sm:grid-cols-4">
                  <label className="text-xs text-muted sm:col-span-2">Name<input name="name" defaultValue={r?.name ?? ""} className="input mt-1 text-ink" required /></label>
                  <label className="text-xs text-muted">Scope<select name="scope" defaultValue={r?.scope ?? "STATE"} className="input mt-1 text-ink"><option value="CENTRAL">Central</option><option value="STATE">State</option></select></label>
                  <label className="text-xs text-muted">State (for state rules)<input name="state" defaultValue={r?.state ?? ""} placeholder="e.g. haryana" className="input mt-1 text-ink" /></label>
                  <Num name="perKwFirst" label="₹ per kW (first)" value={r?.perKwFirst} /><Num name="firstKw" label="for first … kW" value={r?.firstKw} />
                  <label className="text-xs text-muted">₹ per kW (next)<input name="perKwNext" defaultValue={r?.perKwNext ?? 0} className="input mt-1 text-ink" /></label>
                  <label className="text-xs text-muted">for next … kW<input name="nextKw" defaultValue={r?.nextKw ?? 0} className="input mt-1 text-ink" /></label>
                  <Num name="cap" label="Maximum ₹" value={r?.cap} />
                  <label className="text-xs text-muted sm:col-span-3">Source link<input name="source" defaultValue={r?.source ?? ""} className="input mt-1 text-ink" /></label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r?.active ?? true} /> Active</label>
              </ActionForm>
            </details>
          ))}
        </div>
      </Card>
    </>
  );
}
