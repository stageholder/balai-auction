import Link from "next/link";

export default function AdminHome() {
  return (
    <div>
      <h1 className="mb-6 text-3xl">Admin</h1>
      <ul className="space-y-2 text-muted-foreground">
        <li><Link href="/admin/sales" className="text-ink underline">Sales &amp; lots</Link></li>
        <li><Link href="/admin/users" className="text-ink underline">Users</Link></li>
        <li><Link href="/admin/payouts" className="text-ink underline">Payouts</Link></li>
        <li><Link href="/staff/registrations" className="text-ink underline">Registrations</Link></li>
        <li><Link href="/staff/consignor-kyc" className="text-ink underline">Consignor KYC</Link></li>
        <li><Link href="/staff/consignment-requests" className="text-ink underline">Consignment requests</Link></li>
      </ul>
    </div>
  );
}
