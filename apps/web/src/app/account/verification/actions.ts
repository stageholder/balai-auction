"use server";

import { revalidatePath } from "next/cache";
import { prisma, submitConsignorKyc } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Typed result surfaced back to the verification form. */
export type KycActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const ID_TYPES = ["passport", "national_id", "driver_license"] as const;

/**
 * Consignor submits THEIR OWN identity + payout details.
 * Security: the target user id is taken from the SESSION (requireUser), never
 * from the form. Only consignors may submit. All fields are validated server-side.
 */
export async function submitConsignorKycAction(
  _prev: KycActionResult | null,
  formData: FormData
): Promise<KycActionResult> {
  // SESSION user — the only identity we trust for the write target.
  const user = await requireUser();
  if (user.role !== "consignor") {
    return { ok: false, error: "Verification is for consignor accounts only." };
  }

  const legalName = String(formData.get("legalName") ?? "").trim();
  const idType = String(formData.get("idType") ?? "").trim();
  const idNumber = String(formData.get("idNumber") ?? "").trim();
  const bankCode = String(formData.get("bankCode") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const accountHolder = String(formData.get("accountHolder") ?? "").trim();

  if (
    !legalName ||
    !idType ||
    !idNumber ||
    !bankCode ||
    !accountNumber ||
    !accountHolder
  ) {
    return { ok: false, error: "Please complete every field before submitting." };
  }
  if (!ID_TYPES.includes(idType as (typeof ID_TYPES)[number])) {
    return { ok: false, error: "Please choose a valid identity document type." };
  }

  try {
    await submitConsignorKyc(prisma, user.id, {
      legalName,
      idType,
      idNumber,
      bankCode,
      accountNumber,
      accountHolder,
    });
  } catch (err) {
    // Surface a typed error instead of an unhandled server-action crash (e.g. a
    // DB hiccup or a session whose user row was since removed). Log only the
    // error TYPE — a raw DB error can echo the submitted KYC PII (legal name /
    // ID number) into logs.
    const kind = err instanceof Error ? err.name : "unknown error";
    console.error(`consignor KYC submit failed for ${user.id} (${kind})`);
    return { ok: false, error: "Submission failed. Please try again." };
  }

  revalidatePath("/account/verification");
  return {
    ok: true,
    message: "Submitted for review. We will update your status shortly.",
  };
}
