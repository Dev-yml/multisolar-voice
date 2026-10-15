import { config } from "./config";

export type DialRequest = { callId: number; leadId: number; phone: string };

/** The telephone line: Tata Smartflo in production, a simulator for testing. */
export interface PhoneLine {
  name: string;
  dial(req: DialRequest): Promise<{ refId?: string }>;
  hangup?(providerCallId: string): Promise<void>;
  /** Connect a customer to a person: ring the team member first, then the customer. */
  bridge?(req: { agentNumber: string; customerNumber: string; callId: number }): Promise<void>;
}

let nextCaller = 0;
/** Outbound calls take turns using the company numbers (SMARTFLO_CALLER_IDS). */
function callerId() {
  const ids = config.smartflo.callerIds;
  return ids.length ? ids[nextCaller++ % ids.length] : undefined;
}

/**
 * Tata Smartflo — Click to Call Support API.
 * Smartflo dials the customer; when they answer, the call goes to the destination set on the
 * API key in the portal (our Voice Bot), which opens the voice stream to this server.
 */
export class SmartfloLine implements PhoneLine {
  name = "smartflo";

  private auth() {
    const t = config.smartflo.apiToken ?? "";
    return /^bearer /i.test(t) ? t : `Bearer ${t}`;
  }

  async dial({ callId, leadId, phone }: DialRequest) {
    const cid = callerId();
    const res = await fetch(`${config.smartflo.baseUrl}/v1/click_to_call_support`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        customer_number: phone,
        api_key: config.smartflo.c2cKey,
        async: 1,
        ...(cid ? { caller_id: cid } : {}),
        customer_ring_timeout: 30,
        call_timeout: 900,
        // Comes back in webhooks, so the call can be matched to our records.
        custom_identifier: { msv_call_id: String(callId), msv_lead_id: String(leadId) },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let j: { success?: boolean; ref_id?: string; message?: string } = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok || j.success === false) throw new Error(`Smartflo ${res.status}: ${(j.message ?? text).slice(0, 200)}`);
    return { refId: j.ref_id };
  }

  /**
   * Smartflo Click to Call: rings the team member (agent_number) and, when they answer, the customer.
   * The team member's number must be a Smartflo agent / allowed number on the account.
   */
  async bridge({ agentNumber, customerNumber, callId }: { agentNumber: string; customerNumber: string; callId: number }) {
    const cid = callerId();
    const res = await fetch(`${config.smartflo.baseUrl}${config.smartflo.bridgePath}`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        agent_number: agentNumber,
        destination_number: customerNumber,
        async: 1,
        ...(cid ? { caller_id: cid } : {}),
        custom_identifier: { msv_call_id: String(callId), msv_handover: "1" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Smartflo bridge ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  async hangup(providerCallId: string) {
    await fetch(`${config.smartflo.baseUrl}/v1/call/hangup`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: providerCallId }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
}
