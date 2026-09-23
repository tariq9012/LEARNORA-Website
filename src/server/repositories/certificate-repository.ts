import { prisma } from "../db/client";

const CERTIFICATE_COURSE_INCLUDE = {
  course: { select: { slug: true, instructor: { select: { name: true } } } },
} as const;

export function findCertificate(userId: string, courseId: string) {
  return prisma.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } });
}

export function findCertificateById(id: string) {
  return prisma.certificate.findUnique({ where: { id }, include: CERTIFICATE_COURSE_INCLUDE });
}

/** Public lookup by the verification code — never by internal id. */
export function findCertificateByCode(certificateCode: string) {
  return prisma.certificate.findUnique({
    where: { certificateCode },
    include: CERTIFICATE_COURSE_INCLUDE,
  });
}

export function listCertificatesForUser(userId: string) {
  return prisma.certificate.findMany({
    where: { userId },
    include: CERTIFICATE_COURSE_INCLUDE,
    orderBy: { issuedAt: "desc" },
  });
}

export function createCertificate(data: {
  userId: string;
  courseId: string;
  learnerName: string;
  courseTitle: string;
  certificateCode: string;
}) {
  return prisma.certificate.create({ data });
}
