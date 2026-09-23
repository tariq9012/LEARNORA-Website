import { randomUUID } from "node:crypto";

import { Prisma } from "../../generated/prisma/client";
import * as certificateRepository from "../repositories/certificate-repository";
import * as enrollmentRepository from "../repositories/enrollment-repository";
import * as courseRepository from "../repositories/course-repository";
import type { SafeUser } from "../auth/types";
import type { CertificateDTO, PublicCertificateVerificationDTO } from "../dto/certificate";

export class CertificateError extends Error {}
export class CertificateNotEligibleError extends CertificateError {
  constructor() {
    super("Complete this course to earn its certificate.");
  }
}
export class CourseNotFoundForCertificateError extends CertificateError {
  constructor() {
    super("Course not found.");
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * `LRN-<year>-<10 hex chars>` — the hyphenated prefix is just readability;
 * the 10 hex characters (40 bits, from crypto.randomUUID, not a counter)
 * are what make the code infeasible to guess or enumerate. This is the
 * only credential a public verification lookup accepts — never the
 * internal cuid.
 */
function generateCertificateCode(): string {
  const year = new Date().getFullYear();
  const random = randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `LRN-${year}-${random}`;
}

function toDTO(
  cert: {
    id: string;
    certificateCode: string;
    learnerName: string;
    courseTitle: string;
    issuedAt: Date;
  },
  courseSlug: string,
  instructorName: string,
): CertificateDTO {
  return {
    id: cert.id,
    certificateCode: cert.certificateCode,
    learnerName: cert.learnerName,
    courseTitle: cert.courseTitle,
    courseSlug,
    instructorName,
    issuedAt: cert.issuedAt.toISOString(),
  };
}

/**
 * Returns the student's existing certificate for a course, or issues one
 * if they've genuinely completed it. Idempotent by design — a repeated
 * or concurrent call returns the same certificate rather than creating a
 * duplicate, relying on the DB's @@unique([userId, courseId]) as the
 * real guard (the pre-check is just for a fast path / clean read, not a
 * substitute for it).
 *
 * Eligibility comes from Enrollment.status === "COMPLETED" — the exact
 * same field markLessonComplete()/updateVideoProgress() (Phase 5 manual
 * completion and Phase 7 video auto-completion) both already converge
 * on, so there's no separate/competing notion of "done" to keep in sync.
 * A client asserting completed=true is never trusted.
 */
export async function getOrCreateCertificate(
  user: SafeUser,
  courseSlug: string,
): Promise<CertificateDTO> {
  const course = await courseRepository.findCourseBySlugForLearning(courseSlug);
  if (!course) throw new CourseNotFoundForCertificateError();

  const enrollment = await enrollmentRepository.findEnrollment(user.id, course.id);
  if (!enrollment || enrollment.status !== "COMPLETED") {
    throw new CertificateNotEligibleError();
  }

  const existing = await certificateRepository.findCertificate(user.id, course.id);
  if (existing) return toDTO(existing, course.slug, course.instructor.name);

  try {
    const created = await certificateRepository.createCertificate({
      userId: user.id,
      courseId: course.id,
      learnerName: user.name,
      courseTitle: course.title,
      certificateCode: generateCertificateCode(),
    });
    return toDTO(created, course.slug, course.instructor.name);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Lost a race to a concurrent issuance request — the winner's row
      // is what we return, not a second certificate.
      const raced = await certificateRepository.findCertificate(user.id, course.id);
      if (raced) return toDTO(raced, course.slug, course.instructor.name);
    }
    throw error;
  }
}

export async function getMyCertificates(user: SafeUser): Promise<CertificateDTO[]> {
  const rows = await certificateRepository.listCertificatesForUser(user.id);
  return rows.map((r) => toDTO(r, r.course.slug, r.course.instructor.name));
}

/** Owner-only — returns null for "doesn't exist" AND "exists but isn't yours" alike, never distinguishing the two to the caller. */
export async function getCertificateForOwner(
  user: SafeUser,
  certificateId: string,
): Promise<CertificateDTO | null> {
  const cert = await certificateRepository.findCertificateById(certificateId);
  if (!cert || cert.userId !== user.id) return null;
  return toDTO(cert, cert.course.slug, cert.course.instructor.name);
}

/**
 * Public, unauthenticated lookup by certificate code — deliberately
 * returns only the minimal safe fields (see PublicCertificateVerificationDTO)
 * and never distinguishes "no such code" from any other failure.
 */
export async function verifyCertificate(
  rawCode: string,
): Promise<PublicCertificateVerificationDTO> {
  const code = rawCode.trim();
  if (!code) return { valid: false };

  const cert = await certificateRepository.findCertificateByCode(code);
  if (!cert) return { valid: false };

  return {
    valid: true,
    certificateCode: cert.certificateCode,
    learnerName: cert.learnerName,
    courseTitle: cert.courseTitle,
    instructorName: cert.course.instructor.name,
    issuedAt: cert.issuedAt.toISOString(),
  };
}
