"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma, createLot, updateLot, getLot, getSale } from "@/lib/db";
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
  const images = await readImages(formData, []);
  const fields = readFields(formData);
  // NewLot.description is optional string (not nullable) — coerce null→undefined.
  await createLot(prisma, {
    saleId,
    ...fields,
    description: fields.description ?? undefined,
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
  const images = await readImages(formData, lot.images);
  await updateLot(prisma, lotId, { ...readFields(formData), images });
  revalidatePath(`/admin/sales/${saleId}/lots`);
  redirect(`/admin/sales/${saleId}/lots`);
}
