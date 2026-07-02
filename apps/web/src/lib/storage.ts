import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/** Public bucket for catalogue + consignment photos (public URLs are fine). */
const PUBLIC_BUCKET = "lots";
/** Private bucket for identity documents — never public; signed-URL access only. */
const PRIVATE_BUCKET = "kyc-docs";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOC_TYPES = new Set([...IMAGE_TYPES, "application/pdf"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** An uploaded object, shaped for persistence as a MediaAsset. */
export interface UploadedAsset {
  bucket: string;
  path: string;
  url: string | null;
  contentType: string;
  sizeBytes: number;
  originalName: string | null;
}

/** Verify the file's leading bytes actually match its declared MIME type, so a
 *  spoofed `Content-Type` can't smuggle a non-image/PDF past the allowlist. */
async function sniffMatches(file: File, type: string): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  switch (type) {
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/webp":
      return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    case "application/pdf":
      return at(0, 0x25, 0x50, 0x44, 0x46); // %PDF
    default:
      return false;
  }
}

async function validate(file: File, allowed: Set<string>): Promise<void> {
  if (file.size === 0) throw new Error("File is empty.");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB.");
  if (!allowed.has(file.type)) throw new Error("Unsupported file type.");
  if (!(await sniffMatches(file, file.type))) {
    throw new Error("File contents do not match its type.");
  }
}

async function put(
  bucket: string,
  prefix: string,
  file: File,
  allowed: Set<string>
): Promise<{ path: string; contentType: string; sizeBytes: number }> {
  await validate(file, allowed);
  const path = `${prefix}/${randomUUID()}.${EXT[file.type]}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, contentType: file.type, sizeBytes: file.size };
}

/** Upload an image to the PUBLIC bucket and return its asset (with public URL).
 *  Callers must enforce their own authorization. */
export async function uploadPublicImage(
  file: File,
  prefix: "lot" | "consignment"
): Promise<UploadedAsset> {
  const { path, contentType, sizeBytes } = await put(
    PUBLIC_BUCKET,
    prefix,
    file,
    IMAGE_TYPES
  );
  const admin = createAdminClient();
  const url = admin.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;
  return {
    bucket: PUBLIC_BUCKET,
    path,
    url,
    contentType,
    sizeBytes,
    originalName: file.name || null,
  };
}

/** Upload an identity document to the PRIVATE bucket. Returns NO public URL —
 *  reads must go through {@link createSignedUrl}. Callers must authenticate. */
export async function uploadPrivateDoc(file: File): Promise<UploadedAsset> {
  const { path, contentType, sizeBytes } = await put(
    PRIVATE_BUCKET,
    "kyc",
    file,
    DOC_TYPES
  );
  return {
    bucket: PRIVATE_BUCKET,
    path,
    url: null,
    contentType,
    sizeBytes,
    originalName: file.name || null,
  };
}

/** Short-lived signed URL for a private object. Staff-gated at the call site. */
export async function createSignedUrl(
  bucket: string,
  path: string,
  ttlSeconds = 60
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Best-effort delete of a stored object (used when removing a lot image). */
export async function deleteObject(bucket: string, path: string): Promise<void> {
  const admin = createAdminClient();
  await admin.storage.from(bucket).remove([path]);
}

export { PUBLIC_BUCKET, PRIVATE_BUCKET };
