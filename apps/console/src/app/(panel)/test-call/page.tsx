import type { Metadata } from "next";
import { getSettings } from "@/lib/calls";
import { requireUser } from "@/lib/auth/guard";
import { PageTitle } from "../ui";
import { TestCall } from "./TestCall";

export const metadata: Metadata = { title: "Test call" };

export default async function TestCallPage() {
  await requireUser();
  const settings = await getSettings();
  return (
    <>
      <PageTitle title="Test call" sub="Talk to the agent in the browser before any phone line is connected. It uses the same prices, subsidy rules and knowledge as real calls, and saves the call as a test." />
      <TestCall agentName={settings.agentName} sarvamVoice={Boolean(process.env.SARVAM_API_KEY)} />
    </>
  );
}
