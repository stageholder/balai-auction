"use server";

import { revalidatePath } from "next/cache";
import type { NewMedia } from "@auction/db";
import {
  prisma,
  submitConsignorKyc,
  countConsignorKycDocuments,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uploadPrivateDoc } from "@/lib/storage";

/** Typed result surfaced back to the verification form. */
export type KycActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const ID_TYPES = ["passport", "national_id", "driver_license"] as const;
const MAX_DOCS = 4;

/** Upload the submitted identity documents to the PRIVATE bucket. */
async function readDocuments(formData: FormData): Promise<NewMedia[]> {
  const files = formData
    .getAll("documents")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_DOCS);
  const uploaded: NewMedia[] = [];
  for (const file of files) {
    uploaded.push(await uploadPrivateDoc(file));
  }
  return uploaded;
}

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

  let documents: NewMedia[];
  try {
    documents = await readDocuments(formData);
  } catch (err) {
    const kind = err instanceof Error ? err.name : "unknown error";
    console.error(`consignor KYC document upload failed for ${user.id} (${kind})`);
    return {
      ok: false,
      error:
        "One of your documents couldn't be uploaded — please use JPEG, PNG, WebP or PDF under 10MB.",
    };
  }

  // Require a document on the FIRST submission; a later text-only resubmission
  // may keep the documents already on file.
  if (documents.length === 0) {
    const onFile = await countConsignorKycDocuments(prisma, user.id);
    if (onFile === 0) {
      return {
        ok: false,
        error: "Please upload a photo or scan of your identity document.",
      };
    }
  }

  try {
    await submitConsignorKyc(prisma, user.id, {
      legalName,
      idType,
      idNumber,
      bankCode,
      accountNumber,
      accountHolder,
      documents,
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
