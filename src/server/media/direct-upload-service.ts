/**
 * Phase 18 — direct-to-R2 uploads.
 *
 *   browser ── 1. upload-intent (metadata only) ──► Learnora   (auth + ownership + type + size)
 *   browser ◄── presigned PUT for ONE server-chosen key ───────┘
 *   browser ── 2. PUT file bytes ─────────────────► private R2  (never touches Learnora/Vercel)
 *   browser ── 3. finalize (intent id only) ──────► Learnora   (HEAD + 32-byte signature peek, then
 *                                                               ONE transaction creates the Asset)
 *
 * Nothing the browser sends at finalize is trusted: it names an intent, and the
 * expected key/size/type/target all come from the row the SERVER wrote in step 1.
 *
 * LOCAL storage has no presigned upload; `createUploadIntent` then answers
 * { mode: "server" } and the client keeps using the existing multipart routes.
 */
import { z } from "zod";

import { ForbiddenError } from "../auth/guards";
import type { ApprovedInstructor } from "../auth/instructor-guard";
import type { SafeUser } from "../auth/types";
import { prisma } from "../db/client";
import type { AssetDTO, LessonResourceDTO } from "../dto/media";
import { getServerEnv } from "../env";
import * as intentRepository from "../repositories/upload-intent-repository";
import { getStorageProviderFor, type StorageProvider } from "../storage";
import { UploadIntentError, UploadNotFoundError } from "./direct-upload-errors";
import { assertMatchesFileSignature } from "./file-signature";
import { assertAllowedType, assertWithinSizeLimit, type MediaPurpose } from "./media-config";
import { generateAvatarStorageKey, generateStorageKey } from "./media-keys";
import {
  MediaOwnershipError,
  loadEditableOwnedCourse,
  loadOwnedLessonForMedia,
} from "./media-service";
import { lessonResourceUrl, lessonVideoUrl, publicAssetUrl } from "./media-urls";

/** How long the presigned PUT is valid (the PUT must START before this). */
export const PRESIGN_TTL_SECONDS = 10 * 60;
/**
 * How long after creation finalize is still accepted. Much longer than the URL
 * so a slow upload that started in time (e.g. 500 MB on a weak connection) can
 * still complete. Cleanup never touches an intent before this has passed.
 */
export const INTENT_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_OPEN_INTENTS_PER_USER = 20;
/** Extra wait after expiry before cleanup deletes an unfinalized object. */
export const CLEANUP_GRACE_MS = 60 * 60 * 1000;

const SIGNATURE_PEEK_BYTES = 32;

export function isDirectUploadEnabled(): boolean {
  return getServerEnv().STORAGE_PROVIDER === "s3";
}

/**
 * Guard for the legacy multipart routes: when R2 is the storage provider, large
 * bodies must not be proxied through the app server (Vercel rejects them anyway).
 */
export function assertServerMediatedUploadAllowed() {
  if (isDirectUploadEnabled()) {
    throw new UploadIntentError(
      "Uploads in this environment go directly to storage. Please refresh the page and try again.",
    );
  }
}

// ---------------------------------------------------------------------------
// Step 1 — intent
// ---------------------------------------------------------------------------

const PURPOSES = [
  "COURSE_THUMBNAIL",
  "COURSE_PREVIEW",
  "LESSON_VIDEO",
  "LESSON_RESOURCE",
  "AVATAR",
] as const;

export const uploadIntentInputSchema = z.object({
  purpose: z.enum(PURPOSES),
  courseId: z.string().min(1).max(64).optional(),
  lessonId: z.string().min(1).max(64).optional(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(200).optional(),
});
export type UploadIntentInput = z.infer<typeof uploadIntentInputSchema>;

export type UploadIntentResponse =
  | { mode: "server" }
  | {
      mode: "direct";
      intentId: string;
      upload: {
        method: "PUT";
        url: string;
        headers: Record<string, string>;
        /** ISO time after which the URL no longer works. */
        expiresAt: string;
      };
      /** ISO time after which finalize is refused. */
      finalizeBy: string;
    };

function isApprovedInstructor(actor: SafeUser | ApprovedInstructor): actor is ApprovedInstructor {
  return "instructorProfileId" in actor;
}

/** Same ownership rules the legacy routes use (loadEditableOwnedCourse / loadOwnedLessonForMedia). */
async function assertCanAttach(
  instructor: ApprovedInstructor,
  purpose: MediaPurpose,
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
) {
  if (!courseId) throw new UploadIntentError("courseId is required for this upload.");
  if (purpose === "COURSE_THUMBNAIL" || purpose === "COURSE_PREVIEW") {
    await loadEditableOwnedCourse(instructor, courseId);
    return;
  }
  if (!lessonId) throw new UploadIntentError("lessonId is required for this upload.");
  await loadOwnedLessonForMedia(instructor, courseId, lessonId);
}

export async function createUploadIntent(
  actor: SafeUser | ApprovedInstructor,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<UploadIntentResponse> {
  const parsed = uploadIntentInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new UploadIntentError("Invalid upload request.");
  const input = parsed.data;

  // Defence in depth: the route already ran the right guard for this purpose.
  if (input.purpose !== "AVATAR" && !isApprovedInstructor(actor)) throw new ForbiddenError();

  if (!isDirectUploadEnabled()) return { mode: "server" };

  // Same gates as the legacy path, BEFORE any signature exists.
  assertAllowedType(input.purpose, input.mimeType, input.filename);
  assertWithinSizeLimit(input.purpose, input.sizeBytes);

  if (input.purpose !== "AVATAR") {
    await assertCanAttach(
      actor as ApprovedInstructor,
      input.purpose,
      input.courseId,
      input.lessonId,
    );
  }

  if (
    (await intentRepository.countOpenIntentsForUser(actor.id, now)) >= MAX_OPEN_INTENTS_PER_USER
  ) {
    throw new UploadIntentError(
      "Too many uploads in progress. Please wait a few minutes and retry.",
    );
  }

  const mimeType = input.mimeType.toLowerCase();
  const storageKey =
    input.purpose === "AVATAR"
      ? generateAvatarStorageKey(actor.id, mimeType)
      : generateStorageKey({
          purpose: input.purpose,
          mimeType,
          courseId: input.courseId as string,
          ...(input.lessonId && { lessonId: input.lessonId }),
        });

  const storage = getStorageProviderFor("S3");
  if (!storage.createDirectUpload) throw new Error("Storage provider cannot sign direct uploads.");

  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  const intent = await intentRepository.createUploadIntent({
    userId: actor.id,
    purpose: input.purpose,
    courseId: input.purpose === "AVATAR" ? null : (input.courseId ?? null),
    lessonId:
      input.purpose === "LESSON_VIDEO" || input.purpose === "LESSON_RESOURCE"
        ? (input.lessonId ?? null)
        : null,
    storageKey,
    originalFilename: input.filename,
    mimeType,
    expectedSize: input.sizeBytes,
    resourceTitle: input.purpose === "LESSON_RESOURCE" ? input.title?.trim() || null : null,
    expiresAt,
  });

  const ticket = await storage.createDirectUpload({
    key: storageKey,
    contentType: mimeType,
    expiresInSeconds: PRESIGN_TTL_SECONDS,
  });

  return {
    mode: "direct",
    intentId: intent.id,
    upload: {
      method: ticket.method,
      url: ticket.url,
      headers: ticket.headers,
      expiresAt: ticket.expiresAt.toISOString(),
    },
    finalizeBy: expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Step 3 — finalize
// ---------------------------------------------------------------------------

export type FinalizedUpload = AssetDTO | LessonResourceDTO;

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

function normalizeMime(value: string | undefined): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

async function readHeaderBytes(
  storage: StorageProvider,
  key: string,
  size: number,
): Promise<Buffer> {
  const want = Math.min(SIGNATURE_PEEK_BYTES, size);
  const { stream } = await storage.read(key, { start: 0, end: want - 1 });
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= want) break;
    }
  } finally {
    (stream as unknown as { destroy?: () => void }).destroy?.();
  }
  return Buffer.concat(chunks).subarray(0, want);
}

async function rejectAndDiscard(
  storage: StorageProvider,
  key: string,
  message: string,
): Promise<never> {
  // The object can never become valid under this intent; don't leave it behind.
  await storage.delete(key).catch(() => undefined);
  throw new UploadIntentError(message);
}

type ReplacedAsset = { id: string; storageProvider: "LOCAL" | "S3"; storageKey: string } | null;
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type IntentRow = NonNullable<Awaited<ReturnType<typeof intentRepository.findUploadIntentForUser>>>;

/** Creates the Asset and switches the owning relation. Runs inside the finalize transaction. */
async function attachInTransaction(tx: TxClient, intent: IntentRow, userId: string) {
  const asset = await tx.asset.create({
    data: {
      ownerId: userId,
      storageProvider: "S3",
      storageKey: intent.storageKey,
      originalFilename: intent.originalFilename,
      mimeType: intent.mimeType,
      sizeBytes: intent.expectedSize,
      purpose: intent.purpose,
    },
  });

  let previousAssetId: string | null = null;
  let resource: { id: string; title: string } | null = null;

  switch (intent.purpose) {
    case "COURSE_THUMBNAIL":
    case "COURSE_PREVIEW": {
      const course = await tx.course.findFirst({
        where: { id: intent.courseId ?? "", instructorId: userId },
        select: { thumbnailAssetId: true, previewAssetId: true },
      });
      if (!course) throw new MediaOwnershipError();
      if (intent.purpose === "COURSE_THUMBNAIL") {
        previousAssetId = course.thumbnailAssetId;
        await tx.course.update({
          where: { id: intent.courseId as string },
          data: { thumbnailAssetId: asset.id },
        });
      } else {
        previousAssetId = course.previewAssetId;
        await tx.course.update({
          where: { id: intent.courseId as string },
          data: { previewAssetId: asset.id },
        });
      }
      break;
    }
    case "LESSON_VIDEO":
    case "LESSON_RESOURCE": {
      const lesson = await tx.lesson.findFirst({
        where: {
          id: intent.lessonId ?? "",
          section: { courseId: intent.courseId ?? "", course: { instructorId: userId } },
        },
        select: { videoAssetId: true },
      });
      if (!lesson) throw new MediaOwnershipError();
      if (intent.purpose === "LESSON_VIDEO") {
        previousAssetId = lesson.videoAssetId;
        await tx.lesson.update({
          where: { id: intent.lessonId as string },
          data: { videoAssetId: asset.id },
        });
      } else {
        const last = await tx.lessonResource.findFirst({
          where: { lessonId: intent.lessonId as string },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        resource = await tx.lessonResource.create({
          data: {
            lessonId: intent.lessonId as string,
            assetId: asset.id,
            title: intent.resourceTitle?.trim() || intent.originalFilename,
            position: (last?.position ?? -1) + 1,
          },
          select: { id: true, title: true },
        });
      }
      break;
    }
    case "AVATAR": {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { avatarAssetId: true },
      });
      previousAssetId = user?.avatarAssetId ?? null;
      await tx.user.update({ where: { id: userId }, data: { avatarAssetId: asset.id } });
      break;
    }
  }

  // New media is now live. Only now is the previous row removed (never before).
  let replaced: ReplacedAsset = null;
  if (previousAssetId) {
    const previous = await tx.asset.findUnique({ where: { id: previousAssetId } });
    if (previous) {
      await tx.asset.delete({ where: { id: previous.id } });
      replaced = {
        id: previous.id,
        storageProvider: previous.storageProvider,
        storageKey: previous.storageKey,
      };
    }
  }

  await tx.uploadIntent.update({ where: { id: intent.id }, data: { assetId: asset.id } });
  return { asset, resource, replaced };
}

function toDto(
  purpose: MediaPurpose,
  asset: { id: string; originalFilename: string; mimeType: string; sizeBytes: number },
  resource: { id: string; title: string } | null,
): FinalizedUpload {
  if (purpose === "LESSON_RESOURCE") {
    return {
      id: resource?.id ?? "",
      title: resource?.title ?? asset.originalFilename,
      originalFilename: asset.originalFilename,
      sizeBytes: asset.sizeBytes,
      downloadUrl: lessonResourceUrl(asset.id),
    };
  }
  return {
    assetId: asset.id,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    url: purpose === "LESSON_VIDEO" ? lessonVideoUrl(asset.id) : publicAssetUrl(asset.id),
  };
}

/** Result for an intent that was already finalized (duplicate click / retry): returns it, creates nothing. */
async function existingResult(intent: IntentRow): Promise<FinalizedUpload> {
  const asset = intent.assetId
    ? await prisma.asset.findUnique({ where: { id: intent.assetId } })
    : null;
  if (!asset) {
    throw new UploadIntentError("This upload was already completed and has since been removed.");
  }
  const resource =
    intent.purpose === "LESSON_RESOURCE"
      ? await prisma.lessonResource.findUnique({
          where: { assetId: asset.id },
          select: { id: true, title: true },
        })
      : null;
  return toDto(intent.purpose, asset, resource);
}

export async function finalizeUpload(params: {
  user: SafeUser;
  intentId: string;
  /** Resolves the caller as an APPROVED instructor (route passes requireApprovedInstructor). */
  resolveInstructor: () => Promise<ApprovedInstructor>;
  now?: Date;
}): Promise<FinalizedUpload> {
  const { user, intentId } = params;
  const now = params.now ?? new Date();

  // 1. The intent must exist AND belong to the caller — never a client-supplied key.
  const intent = await intentRepository.findUploadIntentForUser(intentId, user.id);
  if (!intent) throw new UploadNotFoundError();

  // 2. Already done → idempotent success (checked before expiry on purpose).
  if (intent.finalizedAt) return existingResult(intent);

  if (intent.expiresAt.getTime() <= now.getTime()) {
    throw new UploadIntentError("This upload expired. Please upload the file again.");
  }
  if (!isDirectUploadEnabled()) throw new UploadIntentError("Direct uploads are not enabled.");

  // 3. Re-authorize against current state (course may have been submitted/removed since step 1).
  if (intent.purpose !== "AVATAR") {
    const instructor = await params.resolveInstructor();
    await assertCanAttach(instructor, intent.purpose, intent.courseId, intent.lessonId);
  }

  // 4. Verify the object itself in R2.
  const storage = getStorageProviderFor("S3");
  let meta;
  try {
    meta = await storage.stat(intent.storageKey);
  } catch (error) {
    if (isNotFound(error)) {
      throw new UploadIntentError("The file hasn't finished uploading yet. Please try again.");
    }
    throw error;
  }

  if (meta.sizeBytes !== intent.expectedSize) {
    await rejectAndDiscard(
      storage,
      intent.storageKey,
      "The uploaded file's size doesn't match what was declared. Please upload it again.",
    );
  }
  if (meta.contentType && normalizeMime(meta.contentType) !== intent.mimeType.toLowerCase()) {
    await rejectAndDiscard(
      storage,
      intent.storageKey,
      "The uploaded file's type doesn't match what was declared. Please upload it again.",
    );
  }

  // Same magic-byte check the multipart path does, from a 32-byte ranged read
  // (the file never travels through this server).
  const header = await readHeaderBytes(storage, intent.storageKey, meta.sizeBytes);
  try {
    assertMatchesFileSignature(header, intent.mimeType);
  } catch (error) {
    await storage.delete(intent.storageKey).catch(() => undefined);
    throw error;
  }

  // 5. One transaction: claim the intent (single winner) + create Asset + switch relation.
  const outcome = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.uploadIntent.updateMany({
        where: { id: intent.id, finalizedAt: null },
        data: { finalizedAt: now },
      });
      // A concurrent finalize already won (the UPDATE waited for its row lock, then matched nothing).
      if (claimed.count === 0) return null;
      return attachInTransaction(tx, intent, user.id);
    },
    { timeout: 20_000, maxWait: 5_000 },
  );

  if (outcome === null) {
    const latest = await intentRepository.findUploadIntentForUser(intent.id, user.id);
    if (!latest) throw new UploadNotFoundError();
    return existingResult(latest);
  }

  // 6. Only after commit: remove the replaced object. Failure here leaves an
  //    unreferenced object, never a broken page.
  if (outcome.replaced) {
    await getStorageProviderFor(outcome.replaced.storageProvider)
      .delete(outcome.replaced.storageKey)
      .catch(() => undefined);
  }

  return toDto(intent.purpose, outcome.asset, outcome.resource);
}

// ---------------------------------------------------------------------------
// Orphan cleanup (manual / schedulable — see scripts/cleanup-upload-intents.ts)
// ---------------------------------------------------------------------------

export type CleanupSummary = {
  dryRun: boolean;
  scanned: number;
  objectsDeleted: number;
  intentsRemoved: number;
  skippedHasAsset: number;
  errors: number;
};

/**
 * Deletes R2 objects for intents that were NEVER finalized and whose finalize
 * window (+ grace) is long over, then removes the intent rows. Safe by design:
 *  - only unfinalized intents are candidates (finalized rows are never touched);
 *  - an object that an Asset row references is never deleted;
 *  - uses the key stored on the intent, never anything from a client.
 * Default is a dry run.
 */
export async function cleanupAbandonedUploads(options: {
  execute?: boolean;
  now?: Date;
  limit?: number;
  graceMs?: number;
}): Promise<CleanupSummary> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.graceMs ?? CLEANUP_GRACE_MS));
  const dryRun = !options.execute;
  const candidates = await intentRepository.findAbandonedIntents(cutoff, options.limit ?? 200);
  const summary: CleanupSummary = {
    dryRun,
    scanned: candidates.length,
    objectsDeleted: 0,
    intentsRemoved: 0,
    skippedHasAsset: 0,
    errors: 0,
  };
  if (candidates.length === 0) return summary;

  const storage = isDirectUploadEnabled() ? getStorageProviderFor("S3") : null;
  for (const candidate of candidates) {
    try {
      const referenced = await prisma.asset.findUnique({
        where: { storageKey: candidate.storageKey },
        select: { id: true },
      });
      if (referenced) {
        summary.skippedHasAsset++;
        continue;
      }
      if (dryRun) continue;
      if (storage) {
        await storage.delete(candidate.storageKey); // idempotent: missing object is fine
        summary.objectsDeleted++;
      }
      const removed = await intentRepository.deleteUploadIntent(candidate.id);
      summary.intentsRemoved += removed.count;
    } catch {
      summary.errors++;
    }
  }
  return summary;
}
