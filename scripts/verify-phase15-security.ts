/**
 * Phase 15 cross-user (IDOR / privilege) checks at the SERVICE layer.
 * Refuses any database whose name does not end in "_test". Needs the normal
 * seed on a fresh _test DB (creates only p15s- prefixed users).
 * Covers what needs no HTTP request context; cookie/CSRF/header behaviour
 * (createServerFn + raw routes) is NOT exercised here.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../src/server/db/client";
import { toSafeUser } from "../src/server/auth/types";
import { createCheckoutOrder, getMyOrder } from "../src/server/services/checkout-service";
import { confirmTestPayment } from "../src/server/services/payment-service";
import { refundOrder } from "../src/server/services/refund-service";
import { approvePayout, requestPayout } from "../src/server/services/payout-service";
import {
  getCourseForBuilder,
  updateCourseMetadata,
  deleteSection,
  createSection,
} from "../src/server/services/instructor-course-service";
import {
  getConversationMessages,
  getOrCreateCourseConversation,
  sendMessage,
} from "../src/server/services/messaging-service";
import { markNotificationRead } from "../src/server/services/notification-service";
import { hashOpaqueToken } from "../src/server/auth/tokens";
import * as passwordResetRepository from "../src/server/repositories/password-reset-repository";
import { canViewAsset } from "../src/server/media/media-access-service";
import type { SafeUser } from "../src/server/auth/types";
import type { ApprovedInstructor } from "../src/server/auth/instructor-guard";

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
};
async function denied(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    check(name, r === null || r === undefined ? true : false, "(call succeeded and returned data)");
  } catch {
    check(name, true);
  }
}

async function byEmail(email: string) {
  return prisma.user.findUniqueOrThrow({ where: { email } });
}
async function approved(email: string): Promise<ApprovedInstructor> {
  const u = await byEmail(email);
  const profile = await prisma.instructorProfile.findUniqueOrThrow({ where: { userId: u.id } });
  return { ...toSafeUser(u), instructorProfileId: profile.id };
}
async function freshStudent(tag: string): Promise<SafeUser> {
  const id = randomUUID().slice(0, 8);
  return toSafeUser(
    await prisma.user.create({
      data: {
        name: `P15S ${tag} ${id}`,
        email: `p15s-${id}@example.test`,
        passwordHash: "x",
        role: "STUDENT",
        studentProfile: { create: {} },
      },
    }),
  );
}
async function buy(student: SafeUser, slug: string) {
  const order = await createCheckoutOrder(student, slug);
  const done = await confirmTestPayment(student, order.orderId);
  if (done.status !== "PAID") throw new Error("purchase failed");
  return order;
}

async function main() {
  const admin = toSafeUser(await byEmail("admin@learnora.dev"));
  const elena = await approved("elena.vasquez@learnora.dev");
  const marcus = await approved("marcus.chen@learnora.dev");
  const elenaCourse = await prisma.course.findFirstOrThrow({
    where: { instructorId: elena.id, status: "PUBLISHED", price: { gt: 0 } },
    include: { sections: { take: 1 } },
  });

  console.log("\n== Instructor course ownership");
  await denied("other instructor cannot open builder for my course", () =>
    getCourseForBuilder(marcus, elenaCourse.id),
  );
  await denied("other instructor cannot edit my course metadata", () =>
    updateCourseMetadata(marcus, elenaCourse.id, { title: "hijacked title" }),
  );
  await denied("other instructor cannot add a section to my course", () =>
    createSection(marcus, elenaCourse.id, { title: "hijack" }),
  );
  const sectionId = elenaCourse.sections[0]?.id;
  if (sectionId) {
    await denied("other instructor cannot delete my section", () =>
      deleteSection(marcus, elenaCourse.id, sectionId),
    );
    check(
      "no section was added to the victim course",
      (await prisma.courseSection.count({
        where: { courseId: elenaCourse.id, title: "hijack" },
      })) === 0,
    );
    check(
      "section still exists after the attempts",
      (await prisma.courseSection.count({ where: { id: sectionId } })) === 1,
    );
  }
  check(
    "course title unchanged after hijack attempt",
    (await prisma.course.findUniqueOrThrow({ where: { id: elenaCourse.id } })).title !==
      "hijacked title",
  );

  console.log("\n== Orders / refunds / payouts");
  const a = await freshStudent("A");
  const b = await freshStudent("B");
  const orderA = await buy(a, elenaCourse.slug);
  check("owner can read own order", (await getMyOrder(a, orderA.orderId)) !== null);
  check(
    "another student gets null for my order id",
    (await getMyOrder(b, orderA.orderId)) === null,
  );
  await denied("student cannot refund (even own order)", () => refundOrder(a, orderA.orderId));
  await denied("instructor cannot refund", () => refundOrder(elena, orderA.orderId));
  check(
    "order still PAID after refused refunds",
    (await prisma.order.findUniqueOrThrow({ where: { id: orderA.orderId } })).status === "PAID",
  );
  await denied("student cannot request a payout", () =>
    requestPayout(a, { expectedAmount: "1.00" }),
  );
  await denied("instructor cannot approve payouts", () => approvePayout(elena, "nonexistent-id"));
  await denied("student cannot approve payouts", () => approvePayout(a, "nonexistent-id"));

  console.log("\n== Messaging privacy");
  const stranger = await freshStudent("Stranger"); // never bought the course
  await denied("unentitled student cannot start a course conversation", () =>
    getOrCreateCourseConversation(stranger, elenaCourse.slug),
  );
  const conv = await getOrCreateCourseConversation(a, elenaCourse.slug);
  await buy(b, elenaCourse.slug);
  await denied("other entitled student cannot read my conversation", () =>
    getConversationMessages(b, { conversationId: conv.id }),
  );
  await denied("unrelated instructor cannot read the conversation", () =>
    getConversationMessages(marcus, { conversationId: conv.id }),
  );
  await denied("admin has no general conversation browser", () =>
    getConversationMessages(admin, { conversationId: conv.id }),
  );
  await denied("other student cannot post into my conversation", () =>
    sendMessage(b, { conversationId: conv.id, content: "hello", clientMessageId: randomUUID() }),
  );
  check(
    "the owning instructor CAN read it",
    (await getConversationMessages(elena, { conversationId: conv.id })).messages !== undefined,
  );
  const cid = randomUUID();
  const m1 = await sendMessage(a, {
    conversationId: conv.id,
    content: "idempotent?",
    clientMessageId: cid,
  });
  const m2 = await sendMessage(a, {
    conversationId: conv.id,
    content: "idempotent?",
    clientMessageId: cid,
  });
  check(
    "same clientMessageId does not duplicate",
    m1.id === m2.id && (await prisma.message.count({ where: { conversationId: conv.id } })) === 1,
  );
  // A different user reusing someone else's clientMessageId must not collide or leak.
  await buy(stranger, elenaCourse.slug);
  const strangerConv = await getOrCreateCourseConversation(stranger, elenaCourse.slug);
  const m3 = await sendMessage(stranger, {
    conversationId: strangerConv.id,
    content: "mine",
    clientMessageId: cid,
  });
  check("clientMessageId is scoped per conversation/sender", m3.id !== m1.id);
  // Refunded entitlement: cannot keep messaging.
  await refundOrder(admin, orderA.orderId, { reason: "idor test" });
  await denied("refunded student cannot send", () =>
    sendMessage(a, {
      conversationId: conv.id,
      content: "after refund",
      clientMessageId: randomUUID(),
    }),
  );

  console.log("\n== Password-reset token is one-time under concurrency");
  const resetUser = await freshStudent("Reset");
  const tok = await passwordResetRepository.createPasswordResetToken({
    userId: resetUser.id,
    tokenHash: hashOpaqueToken(`p15s-${randomUUID()}`),
    expiresAt: new Date(Date.now() + 600_000),
  });
  const claims = await Promise.all(
    Array.from({ length: 8 }, () => passwordResetRepository.claimPasswordResetToken(tok.id)),
  );
  check(
    "exactly one of 8 concurrent claims wins",
    claims.filter((c) => c.count === 1).length === 1,
  );
  const expired = await passwordResetRepository.createPasswordResetToken({
    userId: resetUser.id,
    tokenHash: hashOpaqueToken(`p15s-${randomUUID()}`),
    expiresAt: new Date(Date.now() - 1000),
  });
  check(
    "expired token cannot be claimed",
    (await passwordResetRepository.claimPasswordResetToken(expired.id)).count === 0,
  );

  console.log("\n== Private lesson video entitlement (media access)");
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { isPreview: false, section: { courseId: elenaCourse.id } },
    select: { id: true },
  });
  const asset = await prisma.asset.create({
    data: {
      ownerId: elena.id,
      storageKey: `p15s/${randomUUID()}.mp4`,
      originalFilename: "p15.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10,
      purpose: "LESSON_VIDEO",
    },
  });
  await prisma.lesson.update({ where: { id: lesson.id }, data: { videoAssetId: asset.id } });
  const can = async (u: SafeUser | null) => (await canViewAsset(u, asset.id)).allowed;
  check("anonymous visitor denied", !(await can(null)));
  check("never-enrolled student denied", !(await can(await freshStudent("NoEnroll"))));
  check("owning instructor allowed", await can(elena));
  check("unrelated instructor denied", !(await can(marcus)));
  check("admin allowed (intentional)", await can(admin));
  const live = await freshStudent("Live");
  const liveOrder = await buy(live, elenaCourse.slug);
  check("entitled student allowed", await can(live));
  await refundOrder(admin, liveOrder.orderId, { reason: "media test" });
  check("refunded (cancelled) student denied", !(await can(live)));

  console.log("\n== Notifications");
  const note = await prisma.notification.findFirst({ where: { userId: elena.id } });
  if (note) {
    await denied("another user cannot mark my notification read", () =>
      markNotificationRead(b, note.id),
    );
    check(
      "notification read state unchanged by the other user",
      (
        await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })
      ).readAt?.getTime() === note.readAt?.getTime(),
    );
  } else {
    console.log("  SKIP  no notification row available");
  }
}

main()
  .catch((e) => {
    failed++;
    failures.push(`unexpected: ${e instanceof Error ? e.stack : String(e)}`);
    console.error(e);
  })
  .finally(async () => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failures.length) console.log("Failures:\n - " + failures.join("\n - "));
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  });
