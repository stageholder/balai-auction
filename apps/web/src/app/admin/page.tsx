import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="mb-6 text-3xl">Admin</h1>
      <ul className="space-y-2 text-muted">
        <li><Link href="/admin/sales" className="text-ink underline">Sales &amp; lots</Link></li>
        <li><Link href="/admin/users" className="text-ink underline">Users</Link></li>
        <li><Link href="/admin/payouts" className="text-ink underline">Payouts</Link></li>
        <li><Link href="/staff/registrations" className="text-ink underline">Registrations</Link></li>
      </ul>
    </div>
  );
}
