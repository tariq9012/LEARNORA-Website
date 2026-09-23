export type CertificateDTO = {
  id: string;
  certificateCode: string;
  learnerName: string;
  courseTitle: string;
  courseSlug: string;
  instructorName: string;
  issuedAt: string;
};

/**
 * Deliberately minimal — this is what a logged-out visitor sees when
 * checking a certificate number. No email, no user/enrollment IDs, no
 * internal fields. See certificate-service.ts's verifyCertificate().
 */
export type PublicCertificateVerificationDTO =
  | {
      valid: true;
      certificateCode: string;
      learnerName: string;
      courseTitle: string;
      instructorName: string;
      issuedAt: string;
    }
  | { valid: false };
