import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();
  return (
    <div className="grid gap-10 lg:grid-cols-[180px_1fr]">
      <nav className="flex flex-col gap-2 text-sm">
        <Link href="/admin" className="font-serif text-lg">Admin</Link>
        <Link href="/admin/sales" className="text-muted hover:text-ink">Sales</Link>
        <Link href="/admin/users" className="text-muted hover:text-ink">Users</Link>
        <Link href="/admin/payouts" className="text-muted hover:text-ink">Payouts</Link>
        <Link href="/staff/registrations" className="text-muted hover:text-ink">Registrations</Link>
        <Link href="/staff/consignor-kyc" className="text-muted hover:text-ink">Consignor KYC</Link>
        <Link href="/staff/consignment-requests" className="text-muted hover:text-ink">Consignment requests</Link>
      </nav>
      <div>{children}</div>
    </div>
  );
}
