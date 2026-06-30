import { prisma, listPendingRegistrations } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { DecisionButtons } from "./decision-buttons";

export const dynamic = "force-dynamic";

export default async function StaffRegistrationsPage() {
  await requireStaff();
  const pending = await listPendingRegistrations(prisma);

  return (
    <div>
      <h1 className="mb-8 text-3xl">Pending registrations</h1>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">No registrations awaiting review.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {pending.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-4">
              <div>
                <p className="text-ink">{r.userLegalName ?? r.userEmail}</p>
                <p className="text-sm text-muted-foreground">
                  {r.userEmail} · {r.saleTitle}
                </p>
              </div>
              <DecisionButtons id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
