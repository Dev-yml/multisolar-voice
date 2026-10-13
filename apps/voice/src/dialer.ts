import { beginDial, closeUnanswered, dialFailed, dialerStatus, dueLeads, prisma, setProviderRef } from "@msv/data";
import { config } from "./config";
import type { PhoneLine } from "./phone-line";

/**
 * The auto-dialer: every few seconds it checks the rules (switch on, 09:00–21:00 IST, budget,
 * consent, Do-Not-Call, attempts, retry gap, callbacks due, calls at the same time) and asks the
 * phone line to dial whoever is due. Nobody needs to click anything.
 */
export class Dialer {
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private line: PhoneLine,
    private opts: {
      tickMs: number;
      ignoreHours: boolean;
      retryGapMs?: number;
      unansweredAfterSec: number;
      isTest: boolean;
      /** Simulation only dials its own fake leads. */
      leadSource?: string;
      log: (m: string) => void;
    },
  ) {}

  start() {
    this.timer = setInterval(() => void this.tick(), this.opts.tickMs);
    void this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const closed = await closeUnanswered(this.opts.unansweredAfterSec);
      if (closed) this.opts.log(`dialer: ${closed} call(s) not answered`);
      const st = await dialerStatus(new Date(), { ignoreHours: this.opts.ignoreHours });
      if (!st.canDial || st.freeSlots <= 0) return;
      const leads = await dueLeads(st.freeSlots, new Date(), { retryGapMs: this.opts.retryGapMs, source: this.opts.leadSource });
      for (const lead of leads) await this.dial(lead);
    } catch (e) {
      this.opts.log(`dialer error: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.busy = false;
    }
  }

  async dial(lead: { id: number; phone: string; name?: string | null }) {
    const call = await beginDial(lead, { isTest: this.opts.isTest });
    try {
      const { refId } = await this.line.dial({ callId: call.id, leadId: lead.id, phone: lead.phone });
      if (refId) await setProviderRef(call.id, refId);
      this.opts.log(`dialer: calling lead ${lead.id} (call ${call.id})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await dialFailed(call.id, msg);
      this.opts.log(`dialer: could not call lead ${lead.id}: ${msg}`);
    }
    return call.id;
  }

  /** "Call now" from the Console: consent and Do-Not-Call still apply; calling hours too. */
  async dialNow(leadId: number) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return { ok: false, message: "Lead not found" };
    if (!lead.consentAt) return { ok: false, message: "This lead has not given consent to be called." };
    if (await prisma.doNotCall.findUnique({ where: { phone: lead.phone } })) return { ok: false, message: "This number is on the Do-Not-Call list." };
    const st = await dialerStatus(new Date(), { ignoreHours: this.opts.ignoreHours });
    if (!st.inHours) return { ok: false, message: `Outside calling hours (${st.settings.callingStart}–${st.settings.callingEnd} IST).` };
    if (st.freeSlots <= 0) return { ok: false, message: "All call lines are busy — try again in a minute." };
    const callId = await this.dial(lead);
    return { ok: true, callId };
  }
}

export function dialerFromConfig(line: PhoneLine, log: (m: string) => void) {
  return new Dialer(line, {
    tickMs: config.dialer.tickMs,
    ignoreHours: config.dialer.ignoreHours,
    unansweredAfterSec: config.dialer.unansweredAfterSec,
    isTest: config.smartflo.mode === "sim",
    leadSource: config.smartflo.mode === "sim" ? "sim" : undefined,
    log,
  });
}
