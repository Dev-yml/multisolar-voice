import { config } from "./config";

export type DialRequest = { callId: number; leadId: number; phone: string };

/** The telephone line: Tata Smartflo in production, a simulator for testing. */
export interface PhoneLine {
  name: string;
  dial(req: DialRequest): Promise<{ refId?: string }>;
  hangup?(providerCallId: string): Promise<void>;
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
    const res = await fetch(`${config.smartflo.baseUrl}/v1/click_to_call_support`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        customer_number: phone,
        api_key: config.smartflo.c2cKey,
        async: 1,
        ...(config.smartflo.callerId ? { caller_id: config.smartflo.callerId } : {}),
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

  async hangup(providerCallId: string) {
    await fetch(`${config.smartflo.baseUrl}/v1/call/hangup`, {
      method: "POST",
      headers: { Authorization: this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: providerCallId }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
}
