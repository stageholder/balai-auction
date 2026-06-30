import { prisma, listPendingRegistrations } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
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
import { DecisionButtons } from "./decision-buttons";

export const dynamic = "force-dynamic";

export default async function StaffRegistrationsPage() {
  await requireStaff();
  const pending = await listPendingRegistrations(prisma);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-ink">Pending registrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bidders awaiting approval for upcoming sales.
          </p>
        </div>
        {pending.length > 0 ? (
          <Badge variant="default" className="tnum">
            {pending.length} pending
          </Badge>
        ) : null}
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No registrations awaiting review.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bidder</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium text-ink">
                        {r.userLegalName ?? r.userEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.userEmail}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.saleTitle}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <DecisionButtons id={r.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
