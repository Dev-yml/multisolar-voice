import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/guard";
import { AuthShell } from "../login/AuthShell";
import { SetupMfa } from "./SetupMfa";

export const metadata: Metadata = { title: "Set up two-factor sign-in" };
export const dynamic = "force-dynamic";

export default async function SetupMfaPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  return (
    <AuthShell wide>
      <SetupMfa email={s.user.email} alreadyDone={s.state === "full"} />
    </AuthShell>
  );
}
