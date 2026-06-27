"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IncrementTable } from "@auction/core";
import { isDepartmentSlug, isValidCommissionPct, DEFAULT_SELLER_COMMISSION_PCT } from "@auction/core";
import type { SaleStatus } from "@auction/db";
import { prisma, createSale, updateSale, updateSaleStatus } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const DEFAULT_INCREMENTS: IncrementTable = [
  { upTo: 1_000_000, step: 50_000 },
  { upTo: 5_000_000, step: 100_000 },
  { upTo: null, step: 250_000 },
];

function parseIncrements(raw: string): IncrementTable {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("increment table must be an array");
  return parsed as IncrementTable;
}

function readForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    startsAt: new Date(String(formData.get("startsAt"))),
    endsAt: new Date(String(formData.get("endsAt"))),
    buyersPremiumPct: Number(formData.get("buyersPremiumPct")),
    taxPct: Number(formData.get("taxPct")),
    sellerCommissionPct: (() => {
      const n = Number(formData.get("sellerCommissionPct"));
      return isValidCommissionPct(n) ? n : DEFAULT_SELLER_COMMISSION_PCT;
    })(),
    incrementTable: parseIncrements(
      String(formData.get("incrementTable") || JSON.stringify(DEFAULT_INCREMENTS))
    ),
    mode: formData.get("mode") === "live" ? ("live" as const) : ("timed" as const),
    liveLotSeconds: Number(formData.get("liveLotSeconds") ?? 45),
    category: (() => {
      const raw = String(formData.get("category") ?? "");
      return isDepartmentSlug(raw) ? raw : null;
    })(),
  };
}

export async function createSaleAction(formData: FormData): Promise<void> {
  await requireStaff();
  const fields = readForm(formData);
  const sale = await createSale(prisma, fields);
  revalidatePath("/admin/sales");
  redirect(`/admin/sales/${sale.id}`);
}

export async function updateSaleAction(
  id: string,
  formData: FormData
): Promise<void> {
  await requireStaff();
  await updateSale(prisma, id, readForm(formData));
  revalidatePath(`/admin/sales/${id}`);
}

export async function setSaleStatusAction(
  id: string,
  status: SaleStatus
): Promise<void> {
  await requireStaff();
  await updateSaleStatus(prisma, id, status);
  revalidatePath(`/admin/sales/${id}`);
  revalidatePath("/admin/sales");
}
