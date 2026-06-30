import Link from "next/link";
import {
  Gavel,
  Radio,
  Banknote,
  ClipboardCheck,
  ShieldCheck,
  Inbox,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import {
  prisma,
  listRunningLiveSales,
  listLotsForSale,
  listPayouts,
  listPendingRegistrations,
  listConsignorsForReview,
  listConsignmentRequests,
} from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [liveSales, payouts, registrations, consignors, requests] =
    await Promise.all([
      listRunningLiveSales(prisma),
      listPayouts(prisma),
      listPendingRegistrations(prisma),
      listConsignorsForReview(prisma),
      listConsignmentRequests(prisma),
    ]);

  // Lots live now — count "live" lots across every running live sale.
  const lotsPerSale = await Promise.all(
    liveSales.map((s) => listLotsForSale(prisma, s.id))
  );
  const lotsLiveNow = lotsPerSale
    .flat()
    .filter((l) => l.status === "live").length;

  const pendingPayouts = payouts.filter((p) => p.status === "pending");
  const netPending = pendingPayouts.reduce((sum, p) => sum + p.net, 0);
  const pendingKyc = consignors.filter(
    (c) => c.consignorKycStatus === "pending"
  ).length;
  const newRequests = requests.filter((r) => r.status === "pending").length;

  const stats: {
    label: string;
    value: string;
    sub: string;
    href: string;
    icon: LucideIcon;
    attention: boolean;
  }[] = [
    {
      label: "Live sales",
      value: String(liveSales.length),
      sub: liveSales.length === 1 ? "sale running" : "sales running",
      href: "/admin/sales",
      icon: Gavel,
      attention: false,
    },
    {
      label: "Lots live now",
      value: String(lotsLiveNow),
      sub: "open for bidding",
      href: "/admin/sales",
      icon: Radio,
      attention: false,
    },
    {
      label: "Pending payouts",
      value: String(pendingPayouts.length),
      sub: `${formatRupiah(netPending)} net due`,
      href: "/admin/payouts",
      icon: Banknote,
      attention: pendingPayouts.length > 0,
    },
    {
      label: "Pending registrations",
      value: String(registrations.length),
      sub: "awaiting review",
      href: "/staff/registrations",
      icon: ClipboardCheck,
      attention: registrations.length > 0,
    },
    {
      label: "Pending consignor KYC",
      value: String(pendingKyc),
      sub: "identity decisions",
      href: "/staff/consignor-kyc",
      icon: ShieldCheck,
      attention: pendingKyc > 0,
    },
    {
      label: "New consignment requests",
      value: String(newRequests),
      sub: "to triage",
      href: "/staff/consignment-requests",
      icon: Inbox,
      attention: newRequests > 0,
    },
  ];

  const queues = [
    {
      title: "Registrations",
      desc: "Approve or reject bidders for upcoming sales.",
      href: "/staff/registrations",
      count: registrations.length,
      icon: ClipboardCheck,
    },
    {
      title: "Consignor KYC",
      desc: "Identity, sanctions screening and AML decisions.",
      href: "/staff/consignor-kyc",
      count: pendingKyc,
      icon: ShieldCheck,
    },
    {
      title: "Consignment requests",
      desc: "Triage public “Sell with us” inquiries.",
      href: "/staff/consignment-requests",
      count: newRequests,
      icon: Inbox,
    },
    {
      title: "Payouts",
      desc: "Release settled net proceeds to consignors.",
      href: "/admin/payouts",
      count: pendingPayouts.length,
      icon: Banknote,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-serif text-3xl text-ink">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Command center — live activity and the queues awaiting action.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href} className="group">
              <Card className="h-full transition-colors group-hover:border-ink">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
                  <CardDescription className="text-[0.65rem] uppercase tracking-[0.18em]">
                    {s.label}
                  </CardDescription>
                  <span
                    className={
                      s.attention
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-3">
                    <span className="tnum font-serif text-4xl text-ink">
                      {s.value}
                    </span>
                    {s.attention ? (
                      <Badge variant="default">Action</Badge>
                    ) : (
                      <Badge variant="muted">Clear</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.sub}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Queues */}
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Queues
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <Card key={q.title} className="flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                  <div className="flex items-center gap-3">
                    <span className="text-ink">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="text-lg">{q.title}</CardTitle>
                  </div>
                  {q.count > 0 ? (
                    <Badge variant="default" className="tnum">
                      {q.count}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <p className="text-sm text-muted-foreground">{q.desc}</p>
                  <Link
                    href={q.href}
                    className="inline-flex w-fit items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
                  >
                    Open queue
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
