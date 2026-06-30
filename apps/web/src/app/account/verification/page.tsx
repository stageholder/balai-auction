import type { UserRecord } from "@auction/db";
import { prisma, getUser } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { VerificationForm } from "./verification-form";

export const dynamic = "force-dynamic";

type Tone = "pending" | "positive" | "alert" | "neutral";

const TONE_DOT: Record<Tone, string> = {
  pending: "bg-primary",
  positive: "bg-ink",
  alert: "bg-primary",
  neutral: "bg-line",
};
const TONE_TEXT: Record<Tone, string> = {
  pending: "text-primary",
  positive: "text-ink",
  alert: "text-primary",
  neutral: "text-muted-foreground",
};

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-10 border-b border-line pb-6">
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Account</p>
      <h1 className="font-serif text-4xl font-light text-ink">Verification</h1>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export default async function VerificationPage() {
  // SESSION user (redirects to /sign-in if anonymous).
  const sessionUser = await requireUser();
  // Re-read the OWN record by the session id for the freshest status.
  const user = (await getUser(prisma, sessionUser.id)) ?? sessionUser;

  if (user.role !== "consignor") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader subtitle="Identity and payout verification for sellers." />
        <div className="border border-line bg-paper px-6 py-12 text-center">
          <p className="font-serif text-2xl font-light text-ink">
            Verification is for consignor accounts.
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Identity checks and payout details are collected from sellers
            consigning lots. If you would like to consign with us, our specialists
            will be glad to help.
          </p>
        </div>
      </div>
    );
  }

  const kyc = kycStatus(user.consignorKycStatus);
  const aml = amlStatus(user.consignorAmlStatus);
  const bank = bankOnFile(user);
  const rejected = user.consignorKycStatus === "rejected";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader subtitle="Confirm your identity and payout details so we can clear your lots for sale and settle proceeds." />

      {/* ── Status, front and centre ── */}
      <section
        aria-label="Verification status"
        className="mb-12 border border-line bg-paper"
      >
        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatusCell label="Identity (KYC)" tone={kyc.tone} value={kyc.label} />
          <StatusCell label="Screening (AML)" tone={aml.tone} value={aml.label} />
          <StatusCell label="Payout account" tone={bank.tone} value={bank.label} />
        </div>
      </section>

      {rejected ? (
        <p className="mb-8 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm text-ink">
          Your previous submission could not be verified. Please review your
          details below and resubmit — once is enough.
        </p>
      ) : null}

      <VerificationForm
        rejected={rejected}
        defaults={{
          legalName: user.consignorLegalName ?? user.legalName ?? "",
          idType: user.consignorIdType ?? "",
          idNumber: user.consignorIdNumber ?? "",
          bankCode: user.payoutBankCode ?? "",
          accountNumber: user.payoutAccountNumber ?? "",
          accountHolder: user.payoutAccountHolder ?? "",
        }}
      />
    </div>
  );
}

function StatusCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p
        className={`mt-2 flex items-center gap-2 text-sm font-medium ${TONE_TEXT[tone]}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
          aria-hidden
        />
        {value}
      </p>
    </div>
  );
}

function kycStatus(status: UserRecord["consignorKycStatus"]): {
  tone: Tone;
  label: string;
} {
  switch (status) {
    case "approved":
      return { tone: "positive", label: "Approved" };
    case "rejected":
      return { tone: "alert", label: "Action needed" };
    default:
      return { tone: "pending", label: "Pending review" };
  }
}

function amlStatus(status: UserRecord["consignorAmlStatus"]): {
  tone: Tone;
  label: string;
} {
  switch (status) {
    case "cleared":
      return { tone: "positive", label: "Cleared" };
    case "flagged":
      return { tone: "alert", label: "Under review" };
    default:
      return { tone: "neutral", label: "Awaiting screening" };
  }
}

function bankOnFile(user: UserRecord): { tone: Tone; label: string } {
  const onFile =
    !!user.payoutBankCode &&
    !!user.payoutAccountNumber &&
    !!user.payoutAccountHolder;
  return onFile
    ? { tone: "positive", label: "On file" }
    : { tone: "neutral", label: "Not provided" };
}
