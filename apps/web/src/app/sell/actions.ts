"use server";

import { headers } from "next/headers";
import { isDepartmentSlug } from "@auction/core";
import type { NewMedia } from "@auction/db";
import { prisma, createConsignmentRequest } from "@/lib/db";
import { uploadPublicImage } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import {
  notifyConsignmentReceived,
  notifyStaffNewConsignment,
} from "@/lib/notifications";

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

const MAX_PHOTOS = 8;

/** Best-effort client key from proxy headers for rate limiting. */
async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 100);
}

/** Upload the submitted photographs to the public bucket. Invalid/oversized
 *  files throw from the storage layer; we surface a friendly message. */
async function readPhotos(formData: FormData): Promise<NewMedia[]> {
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_PHOTOS);
  const uploaded: NewMedia[] = [];
  for (const file of files) {
    uploaded.push(await uploadPublicImage(file, "consignment"));
  }
  return uploaded;
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
  // Honeypot: a real person never fills the hidden "company" field. Pretend it
  // worked (don't tip off the bot) but persist nothing.
  if (String(formData.get("company") ?? "").trim() !== "") {
    return { ok: true };
  }

  // Best-effort throttle on this unauthenticated endpoint.
  const limit = rateLimit(`consign:${await clientKey()}`, 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return {
      ok: false,
      error: "You've sent several submissions just now. Please try again shortly.",
    };
  }

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

  let photos: NewMedia[];
  try {
    photos = await readPhotos(formData);
  } catch (err) {
    const kind = err instanceof Error ? err.name : "unknown error";
    console.error(`consignment photo upload failed (${kind})`);
    return {
      ok: false,
      error:
        "One of your photos couldn't be uploaded — please use JPEG, PNG or WebP under 10MB.",
    };
  }

  try {
    await createConsignmentRequest(prisma, {
      name,
      email,
      phone: phone || null,
      category,
      itemTitle,
      itemDescription,
      sellerEstimate,
      photos,
    });
  } catch (err) {
    // Log only the error TYPE — never the submitted contact PII.
    const kind = err instanceof Error ? err.name : "unknown error";
    console.error(`consignment request submit failed (${kind})`);
    return { ok: false, error: "Submission failed. Please try again." };
  }

  // Notifications are best-effort and must never fail the submission — the
  // seller has already been told (and staff can always poll the queue).
  try {
    await Promise.allSettled([
      notifyConsignmentReceived(email, name, itemTitle),
      notifyStaffNewConsignment(name, itemTitle, photos.length),
    ]);
  } catch {
    /* ignore */
  }

  return { ok: true };
}
