import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ForbiddenError, UnauthorizedError, requireStudent } from "../auth/guards";
import {
  CertificateError,
  getCertificateForOwner,
  getMyCertificates,
  getOrCreateCertificate,
  verifyCertificate,
} from "../services/certificate-service";
import type { CertificateDTO, PublicCertificateVerificationDTO } from "../dto/certificate";
import { courseSlugForReviewSchema } from "../validation/review";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

function toActionError(error: unknown): { success: false; error: string } {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.issues[0]?.message ?? "Invalid input." };
  }
  if (error instanceof UnauthorizedError) {
    return { success: false, error: "Please log in to continue." };
  }
  if (error instanceof ForbiddenError) {
    return { success: false, error: "Only student accounts can do that." };
  }
  if (error instanceof CertificateError) {
    return { success: false, error: error.message };
  }
  console.error("[certificate] unexpected error", error);
  return { success: false, error: "Something went wrong. Please try again." };
}

export const getMyCertificatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CertificateDTO[]> => {
    const user = await requireStudent();
    return getMyCertificates(user);
  },
);

/**
 * Idempotent — the first legitimate call issues the certificate, every
 * call after that (including concurrent ones) returns the same one. The
 * client never asserts completion; eligibility is re-derived from the
 * enrollment's real status every time. Reuses the courseSlug validator
 * from review.ts since the shape (`{ courseSlug }`) is identical — no
 * need for a near-duplicate schema.
 */
export const getOrCreateCertificateFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => courseSlugForReviewSchema.parse(data))
  .handler(async ({ data }): Promise<ActionResult<CertificateDTO>> => {
    try {
      const user = await requireStudent();
      const certificate = await getOrCreateCertificate(user, data.courseSlug);
      return { success: true, data: certificate };
    } catch (error) {
      return toActionError(error);
    }
  });

/** Private — owner only. Returns null (not an error) for "not found" or "not yours" alike, so the route can show a normal 404. */
export const getCertificateFn = createServerFn({ method: "GET" })
  .validator((data: { certificateId: string }) => data)
  .handler(async ({ data }): Promise<CertificateDTO | null> => {
    const user = await requireStudent();
    return getCertificateForOwner(user, data.certificateId);
  });

/** Public, unauthenticated — this is the whole point of a verification page. */
export const verifyCertificateFn = createServerFn({ method: "GET" })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<PublicCertificateVerificationDTO> => {
    return verifyCertificate(data.code);
  });
