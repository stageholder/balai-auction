import Link from "next/link";
import { prisma, getRegistration } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { RegisterToBidForm } from "@/app/sales/[id]/register-to-bid";

export async function SaleRegistration({ saleId }: { saleId: string }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <p className="text-sm text-muted">
        <Link href="/sign-in" className="text-ink underline">
          Sign in
        </Link>{" "}
        to register to bid in this sale.
      </p>
    );
  }

  const registration = await getRegistration(prisma, user.id, saleId);

  if (!registration) {
    return (
      <div>
        <h2 className="mb-3 text-xl">Register to bid</h2>
        <RegisterToBidForm saleId={saleId} />
      </div>
    );
  }

  const label: Record<string, string> = {
    pending: "Your registration is pending review.",
    approved: "You are approved to bid in this sale.",
    rejected: "Your registration was not approved.",
  };
  return (
    <p className="text-sm text-muted">{label[registration.kycStatus]}</p>
  );
}
