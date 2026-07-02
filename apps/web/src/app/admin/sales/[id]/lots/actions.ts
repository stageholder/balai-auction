"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { NewMedia } from "@auction/db";
import {
  prisma,
  createLot,
  updateLot,
  getLot,
  getSale,
  listConsignors,
  updateLotClosesAt,
  closeLot,
  addLotMedia,
  removeLotMedia,
} from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uploadPublicImage, deleteObject, PUBLIC_BUCKET } from "@/lib/storage";
import type { RemoveLotImageResult } from "./lot-image-manager";

const MAX_LOT_IMAGES = 8;

/** Upload any newly-selected catalogue images to the public bucket. */
async function readNewImages(formData: FormData): Promise<NewMedia[]> {
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_LOT_IMAGES);
  const uploaded: NewMedia[] = [];
  for (const file of files) {
    uploaded.push(await uploadPublicImage(file, "lot"));
  }
  return uploaded;
}

function readFields(formData: FormData) {
  return {
    lotNumber: Number(formData.get("lotNumber")),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    estimateLow: Number(formData.get("estimateLow")),
    estimateHigh: Number(formData.get("estimateHigh")),
    startingPrice: Number(formData.get("startingPrice")),
    reserve: formData.get("reserve") ? Number(formData.get("reserve")) : null,
    closesAt: new Date(String(formData.get("closesAt"))),
  };
}

export async function createLotAction(
  saleId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const sale = await getSale(prisma, saleId);
  if (!sale) notFound();
  const consignors = await listConsignors(prisma);
  const rawConsignor = String(formData.get("consignorId") ?? "");
  const consignorId =
    rawConsignor && consignors.some((c) => c.id === rawConsignor)
      ? rawConsignor
      : null;
  const media = await readNewImages(formData);
  const fields = readFields(formData);
  // NewLot.description is optional string (not nullable) — coerce null→undefined.
  await createLot(prisma, {
    saleId,
    ...fields,
    description: fields.description ?? undefined,
    consignorId,
    media,
    // Live sales queue their lots; the runner opens them one at a time.
    status: sale.mode === "live" ? "queued" : undefined,
  });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}

export async function updateLotAction(
  saleId: string,
  lotId: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  const lot = await getLot(prisma, lotId);
  if (!lot) notFound();
  const consignors = await listConsignors(prisma);
  const rawConsignor = String(formData.get("consignorId") ?? "");
  const consignorId =
    rawConsignor && consignors.some((c) => c.id === rawConsignor)
      ? rawConsignor
      : null;
  await updateLot(prisma, lotId, { ...readFields(formData), consignorId });
  // Newly-selected images are appended after any existing ones (deletes are
  // handled live by the image manager).
  const media = await readNewImages(formData);
  if (media.length > 0) await addLotMedia(prisma, lotId, media);
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}

/** Delete one catalogue image from a lot (and its stored object). Staff only. */
export async function removeLotImageAction(
  saleId: string,
  lotId: string,
  mediaId: string
): Promise<RemoveLotImageResult> {
  await requireStaff();
  let removed: { bucket: string; path: string } | null;
  try {
    removed = await removeLotMedia(prisma, lotId, mediaId);
  } catch (err) {
    console.error(
      `remove lot image failed for ${lotId} (${err instanceof Error ? err.name : "unknown"})`
    );
    return { ok: false, error: "Could not remove the image. Please try again." };
  }
  if (!removed) {
    return { ok: false, error: "That image is not part of this lot." };
  }
  // Best-effort object cleanup — only for real uploads in the public bucket
  // (seed images live in a pseudo-bucket and have no stored object).
  if (removed.bucket === PUBLIC_BUCKET) {
    await deleteObject(removed.bucket, removed.path);
  }
  revalidatePath(`/admin/sales/${saleId}/lots`);
  revalidatePath(`/admin/sales/${saleId}/lots/${lotId}`);
  return { ok: true };
}

export type CloseLotNowResult =
  | { ok: true; outcome: string; hammerPrice: number }
  | { ok: false; error: string };

/** Operator override: force-close a live lot now to test the hammer→invoice
 *  flow. Intentionally closes even when `closesAt` is in the future. Sold lots
 *  get an Invoice, viewable on /admin/sales/[id]/results. */
export async function closeLotNowAction(
  saleId: string,
  lotId: string
): Promise<CloseLotNowResult> {
  await requireStaff();
  const lot = await getLot(prisma, lotId);
  if (!lot || lot.status !== "live") {
    return { ok: false, error: "Only a live lot can be closed." };
  }
  // Force the close even if closesAt is in the future (early hammer override).
  await updateLotClosesAt(prisma, lotId, new Date(Date.now() - 1000));
  const result = await closeLot(prisma, lotId, new Date());
  revalidatePath(`/admin/sales/${saleId}/lots`);
  revalidatePath(`/admin/sales/${saleId}/results`);
  return { ok: true, outcome: result.outcome, hammerPrice: result.hammerPrice };
}
