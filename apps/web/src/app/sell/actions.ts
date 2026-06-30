"use server";

import { isDepartmentSlug } from "@auction/core";
import { prisma, createConsignmentRequest } from "@/lib/db";

/** Typed result surfaced back to the public Sell form. */
export type ConsignmentActionResult =
  | { ok: true }
  | { ok: false; error: string };

// Length caps mirror the storage contract; enforced server-side so a crafted
// request can't bypass the client constraints.
const MAX = {
  name: 120,
  email: 200,
  phone: 40,
  itemTitle: 200,
  itemDescription: 4000,
} as const;

/** A pragmatic "looks like an email" check: a single @ with a dotted domain. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Parse a non-negative integer estimate, or null for blank/invalid input. */
function parseEstimate(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * PUBLIC consignment inquiry — anyone may submit, so there is deliberately NO
 * requireUser here. Everything is validated and length-capped server-side; the
 * contact PII (name / email / phone) is never logged.
 */
export async function submitConsignmentRequestAction(
  _prev: ConsignmentActionResult | null,
  formData: FormData
): Promise<ConsignmentActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const itemTitle = String(formData.get("itemTitle") ?? "").trim();
  const itemDescription = String(formData.get("itemDescription") ?? "").trim();
  const estimateRaw = String(formData.get("sellerEstimate") ?? "").trim();

  // Required fields.
  if (!name || !email || !itemTitle || !itemDescription) {
    return {
      ok: false,
      error: "Please add your name, email, the item, and a short description.",
    };
  }
  // Email shape.
  if (!looksLikeEmail(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  // Length caps.
  if (
    name.length > MAX.name ||
    email.length > MAX.email ||
    phone.length > MAX.phone ||
    itemTitle.length > MAX.itemTitle ||
    itemDescription.length > MAX.itemDescription
  ) {
    return {
      ok: false,
      error: "One of your entries is too long. Please shorten it and resend.",
    };
  }

  // category: accept only a known department slug, else null.
  const category = isDepartmentSlug(categoryRaw) ? categoryRaw : null;
  // sellerEstimate: non-negative integer or null.
  const sellerEstimate = parseEstimate(estimateRaw);

  try {
    await createConsignmentRequest(prisma, {
      name,
      email,
      phone: phone || null,
      category,
      itemTitle,
      itemDescription,
      sellerEstimate,
    });
  } catch (err) {
    // Log only the error TYPE — never the submitted contact PII.
    const kind = err instanceof Error ? err.name : "unknown error";
    console.error(`consignment request submit failed (${kind})`);
    return { ok: false, error: "Submission failed. Please try again." };
  }

  return { ok: true };
}
