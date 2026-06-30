"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import {
  prisma,
  createLot,
  updateLot,
  getLot,
  getSale,
  listConsignors,
  updateLotClosesAt,
  closeLot,
} from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { uploadLotImage } from "@/lib/storage";

async function readImages(
  formData: FormData,
  existing: string[]
): Promise<string[]> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const url = await uploadLotImage(file);
    return [url, ...existing];
  }
  return existing;
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
  const images = await readImages(formData, []);
  const fields = readFields(formData);
  // NewLot.description is optional string (not nullable) — coerce null→undefined.
  await createLot(prisma, {
    saleId,
    ...fields,
    description: fields.description ?? undefined,
    consignorId,
    images,
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
  const images = await readImages(formData, lot.images);
  await updateLot(prisma, lotId, { ...readFields(formData), consignorId, images });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
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
