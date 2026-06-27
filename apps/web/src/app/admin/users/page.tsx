import { prisma, listUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { RoleSelect } from "./role-select";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  const users = await listUsers(prisma);

  return (
    <div>
      <h1 className="mb-6 text-2xl">Users</h1>
      <ul className="divide-y divide-line border-y border-line">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-ink">{u.email}</p>
              <p className="text-xs uppercase tracking-[0.15em] text-muted">{u.role}</p>
            </div>
            <RoleSelect userId={u.id} role={u.role} disabled={u.id === me?.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
