# Message to Tata Tele Business Services (Smartflo account manager / support)

Copy, fill the account details, and send from the company email.

---

**Subject:** Smartflo — AI voice bot integration (inbound + outbound) for Multi Solar

Hello Team,

We have a Smartflo account for Multi Solar (Multi Infrastructure & Engineering Pvt. Ltd.) with the DID
**080-6537-8787** (account / company ID: ________). We are building our own AI voice assistant and want to connect
it to Smartflo for both **inbound** and **outbound** calls, without a human agent being logged in.
Please help with the following:

1. **Voice Streaming / AI bot integration:** please enable **Channels Hub → Voice Bot** (bi-directional voice
   streaming over WebSocket) on our account. We will add our own `wss://` endpoint under
   Settings → Channels → Voice Bot.
2. **Inbound:** how do we route calls on 080-6537-8787 to the bot (call flow / IVR node that connects to our
   WebSocket), with a fallback to a human queue if the bot is unavailable?
3. **Outbound via API:** we plan to use the Click to Call Support API with the API key's destination set to our
   Voice Bot. Please confirm this is enabled for our plan, and that `caller_id` = our DID 080-6537-8787 is allowed.
4. **API token:** please share how to generate the API token for our account, and the token validity.
5. **Concurrency:** how many simultaneous calls (channels) does our plan allow, and the API rate limit?
6. **Webhooks:** can Smartflo call our URL on call events (answered, hung up, missed) with the call ID,
   duration and **recording URL**? How long are recordings kept, and can we download them via API?
7. **Compliance:** is this number allowed for automated outbound calls to customers who have enquired with us
   (consent-based)? What do we need for TRAI / DLT (headers, templates, 140-series or not)?
8. **Agent login:** we noticed that inbound/outbound stops when the logged-in agent closes the browser /
   extension. Please confirm that a bot-routed flow does **not** need any agent to stay logged in.
9. **Test setup:** can we get a test call flow so we can try the bot on our own mobile before going live?

Thank you,
________ (name)
Multi Solar — IT
________ (company email) | ________ (phone)
