import { Fragment } from "react";
import { prisma, listUsers } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { RoleSelect } from "./role-select";
import { PayoutAccountForm } from "./payout-account-form";

export const dynamic = "force-dynamic";

const ROLE_VARIANT = {
  staff: "default",
  consignor: "secondary",
  buyer: "muted",
} as const;

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  const users = await listUsers(prisma);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Roles and consignor payout accounts.
          </p>
        </div>
        <Badge variant="muted" className="tnum">
          {users.length} total
        </Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Manage role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <TableRow className={u.role === "consignor" ? "border-b-0" : ""}>
                    <TableCell className="font-medium text-ink">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[u.role]}>{u.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RoleSelect
                        userId={u.id}
                        role={u.role}
                        disabled={u.id === me?.id}
                      />
                    </TableCell>
                  </TableRow>
                  {u.role === "consignor" ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={3} className="bg-card/40 pt-0">
                        <PayoutAccountForm
                          userId={u.id}
                          bankCode={u.payoutBankCode}
                          accountNumber={u.payoutAccountNumber}
                          accountHolder={u.payoutAccountHolder}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
