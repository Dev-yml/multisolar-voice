import type { Metadata } from "next";
import { KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/roles";
import { formatDateTime } from "@/lib/util";
import { ActionForm } from "../ActionForm";
import { changeOwnPassword } from "../actions";
import { Badge, Card, CardHeader, PageTitle } from "../ui";
import { RecoveryCodes } from "./RecoveryCodes";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const me = await requireUser();
  const mfa = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { mfaEnabledAt: true, mfaRecovery: true } });
  const recoveryLeft = Array.isArray(mfa.mfaRecovery) ? mfa.mfaRecovery.length : 0;
  const LABEL: Record<string, string> = {
    login: "Signed in", "login.failed": "Wrong password", "mfa.failed": "Wrong authenticator code", "user.password_changed": "Password changed",
    "mfa.enabled": "Two-factor sign-in turned on", "mfa.recovery_used": "Signed in with a recovery code", "mfa.recovery_regenerated": "New recovery codes",
  };
  const recent = await prisma.auditLog.findMany({
    where: { userId: me.id, action: { in: Object.keys(LABEL) } },
    orderBy: { at: "desc" },
    take: 8,
  });
  return (
    <>
      <PageTitle title="My account" sub={`${me.name} · ${me.email} · ${ROLE_LABELS[me.role]}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Change password" sub={`At least ${MIN_PASSWORD_LENGTH} characters`} icon={KeyRound} />
          <ActionForm action={changeOwnPassword} submit="Change password" resetOnOk>
            <div className="space-y-3">
              <input name="current" type="password" required autoComplete="current-password" placeholder="Current password" className="input" />
              <input name="next" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder="New password" className="input" />
              <input name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder="Repeat new password" className="input" />
            </div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Two-factor sign-in" sub="Authenticator app code at every sign-in" icon={Smartphone}>
            {mfa.mfaEnabledAt ? <Badge tone="green" dot>On</Badge> : <Badge tone="red" dot>Off</Badge>}
          </CardHeader>
          <p className="text-sm text-ink-2">
            {mfa.mfaEnabledAt ? <>Turned on {formatDateTime(mfa.mfaEnabledAt)}. </> : null}
            <b className={recoveryLeft <= 2 ? "text-rose-700" : "text-ink"}>{recoveryLeft}</b> of 8 recovery codes left.
          </p>
          <p className="mt-1 text-xs text-muted">Lost or used your recovery codes? Make a new set with a code from your app. New phone? Ask a Super Admin to reset your two-factor sign-in.</p>
          <div className="mt-4"><RecoveryCodes /></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent sign-in activity" sub="If you see something you did not do, change your password" icon={ShieldCheck} />
          <ul className="divide-y divide-[#f1ede7] text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <span className={r.action.endsWith(".failed") || r.action === "mfa.recovery_used" ? "font-semibold text-rose-700" : "text-ink"}>
                  {LABEL[r.action] ?? r.action}
                </span>
                <span className="text-muted">{formatDateTime(r.at)}</span>
              </li>
            ))}
            {!recent.length && <li className="py-2.5 text-muted">No activity yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
