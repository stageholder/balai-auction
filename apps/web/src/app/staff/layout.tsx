import { requireStaff } from "@/lib/auth";
import { ConsoleShell } from "../admin/console-shell";

export const dynamic = "force-dynamic";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireStaff();
  return <ConsoleShell email={me.email}>{children}</ConsoleShell>;
}
