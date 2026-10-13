import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { ADMINS, ROLE_LABELS, ROLES } from "@/lib/roles";
import { formatDateTime } from "@/lib/util";
import { ActionForm } from "../ActionForm";
import { createUser, resetUserMfa, toggleUser } from "../actions";
import { Badge, Card, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser(ADMINS);
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageTitle title="Users" sub="Staff who can open the Voice Console. Everyone must set up two-factor sign-in (authenticator app) at first sign-in." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card flush className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Two-factor</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}<div className="text-xs font-normal text-muted">{u.email}</div></td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td className="whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "never"}</td>
                  <td>{u.mfaEnabledAt ? <Badge tone="green" dot>on</Badge> : <Badge tone="amber" dot>not set up</Badge>}</td>
                  <td>{u.active ? <Badge tone="green">active</Badge> : <Badge>off</Badge>}</td>
                  <td className="whitespace-nowrap">
                    {u.id !== me.id && (
                      <span className="flex items-center gap-3">
                        <form action={toggleUser}><input type="hidden" name="id" value={u.id} /><button className="text-sm text-accent-ink underline underline-offset-4">{u.active ? "Deactivate" : "Activate"}</button></form>
                        {u.mfaEnabledAt && (
                          <form action={resetUserMfa}><input type="hidden" name="id" value={u.id} /><button className="text-sm text-rose-700 underline underline-offset-4" title="Lost phone: they set up a new authenticator at next sign-in">Reset two-factor</button></form>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="font-semibold">Add a user</h2>
          <ActionForm action={createUser} submit="Create user" resetOnOk className="mt-3 space-y-2">
            <input name="name" placeholder="Full name" required className="input" />
            <input name="email" type="email" placeholder="Email" required className="input" />
            <input name="password" type="password" placeholder={`Password (${MIN_PASSWORD_LENGTH}+ characters)`} required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className="input" />
            <select name="role" className="input" defaultValue="SALES_EXECUTIVE">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
