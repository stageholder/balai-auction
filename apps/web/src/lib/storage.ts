import "server-only";
import { randomUUID } from "node:crypto";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "lots";
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Upload a lot image to Storage and return its public URL. Staff only. */
export async function uploadLotImage(file: File): Promise<string> {
  await requireStaff();
  if (!ALLOWED.has(file.type)) {
    throw new Error("Unsupported image type.");
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
