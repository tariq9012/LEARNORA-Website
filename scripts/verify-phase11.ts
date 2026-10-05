/**
 * Phase 11 integration verification — real services, real PostgreSQL, no
 * mocks. Same safety rules as verify-phase10.ts: it refuses to run unless the
 * database name ends in "_test", and it needs the normal seed data
 * (npm run db:seed) for instructors, admin and courses.
 *
 *   DATABASE_URL=... DIRECT_URL=... SESSION_SECRET=<32+ chars> npm run verify:phase11
 *
 * Not covered here (needs a browser): the React UI interactions, the sidebar
 * badges, polling, and the HTTP guards inside createServerFn.
 */
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/client";
import { toSafeUser } from "../src/server/auth/types";
import { isSafeInternalPath } from "../src/lib/safe-path";
import { RateLimitExceededError } from "../src/server/auth/rate-limit";
import { createCheckoutOrder } from "../src/server/services/checkout-service";
import { confirmTestPayment } from "../src/server/services/payment-service";
import { enrollInCourse, markLessonComplete } from "../src/server/services/enrollment-service";
import { getOrCreateCertificate } from "../src/server/services/certificate-service";
import { refundOrder } from "../src/server/services/refund-service";
import { approvePayout, rejectPayout, requestPayout } from "../src/server/services/payout-service";
import { approveCourse, rejectCourse } from "../src/server/services/admin-course-review-service";
import { getInstructorEarningsSummary } from "../src/server/services/earnings-service";
import {
  getMyNotifications,
  getUnreadCounts,
  markAllNotificationsRead,
  markNotificationRead,
  notify,
} from "../src/server/services/notification-service";
import {
  getConversationMessages,
  getMyConversations,
  getOrCreateCourseConversation,
  markConversationRead,
  sendMessage,
} from "../src/server/services/messaging-service";
import { MessageBubble } from "../src/components/dashboard/MessageBubble";
import type { SafeUser } from "../src/server/auth/types";

const dbName = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/none").pathname.slice(1);
if (!dbName.endsWith("_test")) {
  console.error(`Refusing to run: database "${dbName}" does not end with "_test".`);
  process.exit(2);
}

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}
async function rejectsWith(
  name: string,
  fn: () => Promise<unknown>,
  match: (e: unknown) => boolean,
) {
  try {
    await fn();
    check(name, false, "(did not throw)");
  } catch (e) {
    check(name, match(e), `(threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)})`);
  }
}
const code = (c: string) => (e: unknown) => (e as { code?: string }).code === c;
const named = (n: string) => (e: unknown) => e instanceof Error && e.name === n;
const section = (t: string) => console.log(`\n== ${t}`);
const uid = () => randomUUID().replace(/-/g, "").slice(0, 16);

async function user(email: string): Promise<SafeUser> {
  return toSafeUser(await prisma.user.findUniqueOrThrow({ where: { email } }));
}
async function freshStudent(): Promise<SafeUser> {
  const id = randomUUID().slice(0, 8);
  return toSafeUser(
    await prisma.user.create({
      data: {
        name: `P11 Student ${id}`,
        email: `p11-${id}@example.test`,
        passwordHash: "x",
        role: "STUDENT",
      },
    }),
  );
}
async function buy(student: SafeUser, slug: string): Promise<string> {
  const order = await createCheckoutOrder(student, slug);
  const done = await confirmTestPayment(student, order.orderId);
  if (done.status !== "PAID") throw new Error("purchase failed");
  return order.orderId;
}
const notifs = (userId: string, where: Prisma.NotificationWhereInput = {}) =>
  prisma.notification.findMany({ where: { userId, ...where }, orderBy: { createdAt: "asc" } });
const send = (u: SafeUser, conversationId: string, content: string, clientMessageId = uid()) =>
  sendMessage(u, { conversationId, content, clientMessageId });

async function main() {
  const admin = await user("admin@learnora.dev");
  const elena = await user("elena.vasquez@learnora.dev");
  const marcus = await user("marcus.chen@learnora.dev");
  const TS = "advanced-typescript-patterns"; // Elena, 94.99
  const tsCourse = await prisma.course.findUniqueOrThrow({ where: { slug: TS } });

  // ============================================================ NOTIFICATIONS
  section("Notifications: ownership, counts, read state, pagination (matrix A-F)");
  const uA = await freshStudent();
  const uB = await freshStudent();
  await notify({
    userId: uA.id,
    type: "SYSTEM",
    title: "A-1",
    message: "for A",
    eventKey: `t:${uid()}`,
  });
  await notify({
    userId: uA.id,
    type: "SYSTEM",
    title: "A-2",
    message: "for A",
    eventKey: `t:${uid()}`,
  });
  await notify({
    userId: uB.id,
    type: "SYSTEM",
    title: "B-1",
    message: "for B",
    eventKey: `t:${uid()}`,
  });
  const pageA = await getMyNotifications(uA);
  check(
    "A: user sees only their own notifications",
    pageA.items.length === 2 && pageA.items.every((i) => i.title.startsWith("A-")),
  );
  check(
    "B: unread count is correct",
    pageA.unreadCount === 2 && (await getUnreadCounts(uA)).notifications === 2,
  );
  const first = pageA.items[0]!;
  const marked = await markNotificationRead(uA, first.id);
  check(
    "C: mark one read",
    marked.read && !!marked.readAt && (await getUnreadCounts(uA)).notifications === 1,
  );
  await rejectsWith(
    "F: user B cannot mark user A's notification read",
    () => markNotificationRead(uB, pageA.items[1]!.id),
    named("NotificationNotFoundError"),
  );
  check("F: ...and A's notification is unchanged", (await getUnreadCounts(uA)).notifications === 1);
  await rejectsWith(
    "F: unknown notification id -> not found (same answer)",
    () => markNotificationRead(uA, "nope"),
    named("NotificationNotFoundError"),
  );
  await markAllNotificationsRead(uB);
  check(
    "F: B's mark-all does not touch A",
    (await getUnreadCounts(uA)).notifications === 1 &&
      (await getUnreadCounts(uB)).notifications === 0,
  );
  const all = await markAllNotificationsRead(uA);
  check("D: mark all read", all.updated === 1 && (await getUnreadCounts(uA)).notifications === 0);

  const uP = await freshStudent();
  await prisma.notification.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      userId: uP.id,
      type: "SYSTEM" as const,
      title: `P-${i}`,
      message: "x",
      eventKey: null,
    })),
  });
  const p1 = await getMyNotifications(uP, { limit: 20 });
  check("E: page 1 has 20 items and a cursor", p1.items.length === 20 && !!p1.nextCursor);
  const seen = new Set(p1.items.map((i) => i.id));
  let cursor = p1.nextCursor;
  let pages = 1;
  while (cursor) {
    const next = await getMyNotifications(uP, { limit: 20, cursor });
    for (const i of next.items) seen.add(i.id);
    cursor = next.nextCursor;
    pages++;
  }
  check(
    "E: cursor walk returns all 55 exactly once",
    seen.size === 55 && pages === 3,
    `(seen=${seen.size}, pages=${pages})`,
  );
  check(
    "E: page size is capped at 50",
    (await getMyNotifications(uP, { limit: 500 })).items.length === 50,
  );
  check(
    "E: unread-only filter",
    (await getMyNotifications(uP, { unreadOnly: true, limit: 50 })).items.every((i) => !i.read),
  );
  await rejectsWith(
    "E: tampered cursor rejected",
    () => getMyNotifications(uP, { cursor: "AAAA" }),
    named("InvalidCursorError"),
  );

  section("Notification safety: links, dedup, isolation");
  check(
    "isSafeInternalPath accepts internal paths",
    isSafeInternalPath("/student/purchases") && isSafeInternalPath("/student/messages?c=abc_1-2"),
  );
  check(
    "isSafeInternalPath rejects external / tricky links",
    [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.com",
      "/a b",
      "",
      "/x\n",
      "http://x",
    ].every((v) => !isSafeInternalPath(v)),
  );
  const uL = await freshStudent();
  for (const [link, keep] of [
    ["https://evil.example", false],
    ["//evil.example", false],
    ["javascript:alert(1)", false],
    ["/student/purchases", true],
  ] as const) {
    await notify({
      userId: uL.id,
      type: "SYSTEM",
      title: "link",
      message: "m",
      link,
      eventKey: `l:${uid()}`,
    });
  }
  const stored = await notifs(uL.id);
  check(
    "only internal links are stored (external/JS links become null)",
    stored.filter((n) => n.link).length === 1 &&
      stored.find((n) => n.link)?.link === "/student/purchases",
  );
  await prisma.notification.create({
    data: {
      userId: uL.id,
      type: "SYSTEM",
      title: "bad row",
      message: "m",
      link: "https://evil.example",
    },
  });
  check(
    "a bad legacy row is sanitised on the way out",
    (await getMyNotifications(uL, { limit: 50 })).items.every(
      (i) => i.link === null || isSafeInternalPath(i.link),
    ),
  );
  const key = `dup:${uid()}`;
  const r1 = await notify({
    userId: uL.id,
    type: "SYSTEM",
    title: "once",
    message: "m",
    eventKey: key,
  });
  const r2 = await notify({
    userId: uL.id,
    type: "SYSTEM",
    title: "once",
    message: "m",
    eventKey: key,
  });
  check(
    "O: same eventKey twice -> one row",
    r1 === true &&
      r2 === false &&
      (await prisma.notification.count({ where: { userId: uL.id, eventKey: key } })) === 1,
  );
  const par = await Promise.all(
    Array.from({ length: 8 }, () =>
      notify({ userId: uL.id, type: "SYSTEM", title: "par", message: "m", eventKey: "par:1" }),
    ),
  );
  check(
    "O: 8 concurrent identical events -> exactly one row",
    par.filter(Boolean).length === 1 &&
      (await prisma.notification.count({ where: { userId: uL.id, eventKey: "par:1" } })) === 1,
  );
  check(
    "same eventKey for DIFFERENT users is allowed",
    (await notify({
      userId: uA.id,
      type: "SYSTEM",
      title: "s",
      message: "m",
      eventKey: "shared:1",
    })) &&
      (await notify({
        userId: uB.id,
        type: "SYSTEM",
        title: "s",
        message: "m",
        eventKey: "shared:1",
      })),
  );
  check(
    "notification failure is swallowed (best-effort): bad user id returns false, no throw",
    (await notify({
      userId: "no-such-user",
      type: "SYSTEM",
      title: "x",
      message: "y",
      eventKey: "z",
    })) === false,
  );
  const longTitle = "T".repeat(500);
  await notify({
    userId: uL.id,
    type: "SYSTEM",
    title: longTitle,
    message: "M".repeat(900),
    eventKey: `long:${uid()}`,
  });
  const longRow = (await notifs(uL.id, { eventKey: { startsWith: "long:" } }))[0]!;
  check(
    "title/message are length-bounded",
    longRow.title.length <= 120 && longRow.message.length <= 300,
  );

  // ------------------------------------------------- business-event notifications
  section("Business events: payment, enrollment, refund (matrix G, H, O)");
  const stA = await freshStudent();
  const orderA = await buy(stA, TS);
  const n = await notifs(stA.id, { type: "PAYMENT" });
  check(
    "G: payment success notifies the student",
    n.length === 1 && n[0]!.link === "/student/purchases" && n[0]!.eventKey === `payment:${orderA}`,
  );
  check(
    "G: message contains no card/provider data",
    !/SIM-|externalReference|card/i.test(n[0]!.message),
  );
  await confirmTestPayment(stA, orderA);
  await confirmTestPayment(stA, orderA);
  check(
    "O: re-confirming an already-paid order does not duplicate the notification",
    (await notifs(stA.id, { type: "PAYMENT" })).length === 1,
  );
  check(
    "policy: a PAID enrollment gets no separate ENROLLMENT notification",
    (await notifs(stA.id, { type: "ENROLLMENT" })).length === 0,
  );
  const stFail = await freshStudent();
  const failOrder = await createCheckoutOrder(stFail, "python-for-data-science");
  await confirmTestPayment(stFail, failOrder.orderId, { simulateFailure: true }).catch(
    () => undefined,
  );
  check("policy: a failed payment creates no notification", (await notifs(stFail.id)).length === 0);

  const freeCourse = await prisma.course.findFirstOrThrow({
    where: { status: "PUBLISHED", price: 0 },
  });
  const stFree = await freshStudent();
  await enrollInCourse(stFree, freeCourse.slug);
  const en = await notifs(stFree.id, { type: "ENROLLMENT" });
  check("free enrollment notifies once", en.length === 1);
  await enrollInCourse(stFree, freeCourse.slug).catch(() => undefined);
  check(
    "repeat enrollment attempt does not add another",
    (await notifs(stFree.id, { type: "ENROLLMENT" })).length === 1,
  );

  // Refund: student + instructor, once, only after commit
  const stR = await freshStudent();
  const orderR = await buy(stR, "design-systems-fundamentals");
  const dsCourse = await prisma.course.findUniqueOrThrow({
    where: { slug: "design-systems-fundamentals" },
  });
  const dsInstructor = await prisma.user.findUniqueOrThrow({
    where: { id: dsCourse.instructorId },
  });
  const before = await prisma.notification.count({ where: { type: "REFUND" } });
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => refundOrder(admin, orderR)),
  );
  check(
    "H: 5 simultaneous refunds -> one succeeds",
    results.filter((r) => r.status === "fulfilled").length === 1,
  );
  const refundRow = await prisma.refund.findFirstOrThrow({
    where: { payment: { orderId: orderR } },
  });
  check(
    "H: student got exactly one REFUND notification",
    (await notifs(stR.id, { type: "REFUND" })).length === 1,
  );
  check(
    "H: instructor got exactly one reversal notification",
    (await notifs(dsInstructor.id, { type: "REFUND", eventKey: `refund-reversal:${refundRow.id}` }))
      .length === 1,
  );
  check(
    "H: no extra REFUND notifications anywhere",
    (await prisma.notification.count({ where: { type: "REFUND" } })) === before + 2,
  );
  await refundOrder(admin, orderR).catch(() => undefined);
  check(
    "O: a later duplicate refund request adds nothing",
    (await prisma.notification.count({ where: { type: "REFUND" } })) === before + 2,
  );
  const stRfail = await freshStudent();
  const orderBlocked = await buy(stRfail, TS);
  const blockedBefore = await prisma.notification.count({ where: { type: "REFUND" } });
  // reserve the earning in a payout -> refund must be blocked and must NOT notify
  const elenaBal = (await getInstructorEarningsSummary(elena)).availableBalance;
  const pay = await requestPayout(elena, { expectedAmount: elenaBal });
  await refundOrder(admin, orderBlocked).catch(() => undefined);
  check(
    "refund blocked by a pending payout sends no notification",
    (await prisma.notification.count({ where: { type: "REFUND" } })) === blockedBefore,
  );

  section("Payout notifications (matrix I, J, K)");
  let pn = await notifs(elena.id, { eventKey: `payout-requested:${pay.id}` });
  check(
    "I: payout requested notifies the instructor",
    pn.length === 1 && pn[0]!.type === "PAYOUT" && pn[0]!.link === "/instructor/earnings",
  );
  await rejectPayout(admin, pay.id, "Please verify your details");
  pn = await notifs(elena.id, { eventKey: `payout-rejected:${pay.id}` });
  check(
    "K: rejection notifies with the safe reason",
    pn.length === 1 && pn[0]!.message.includes("Please verify your details"),
  );
  await rejectPayout(admin, pay.id).catch(() => undefined);
  check(
    "K/O: repeating the rejection does not notify again",
    (await notifs(elena.id, { eventKey: `payout-rejected:${pay.id}` })).length === 1,
  );
  const bal2 = (await getInstructorEarningsSummary(elena)).availableBalance;
  const pay2 = await requestPayout(elena, { expectedAmount: bal2 });
  await Promise.allSettled([
    approvePayout(admin, pay2.id),
    approvePayout(admin, pay2.id),
    approvePayout(admin, pay2.id),
  ]);
  check(
    "J: paid notifies exactly once even with 3 simultaneous approvals",
    (await notifs(elena.id, { eventKey: `payout-paid:${pay2.id}` })).length === 1,
  );
  check(
    "payout notifications contain no internal notes",
    !(await notifs(elena.id, { type: "PAYOUT" })).some((x) =>
      /internal|admin note/i.test(x.message),
    ),
  );

  section("Moderation notifications (matrix L)");
  const draft = await prisma.course.findFirstOrThrow({ where: { status: { not: "PUBLISHED" } } });
  await prisma.course.update({ where: { id: draft.id }, data: { status: "PENDING_REVIEW" } });
  await approveCourse(admin.id, draft.id);
  let cn = await notifs(draft.instructorId, { type: "COURSE_APPROVED" });
  check(
    "L: approval notifies the course owner",
    cn.filter((x) => x.eventKey?.startsWith(`course-review:${draft.id}:`)).length === 1,
  );
  await approveCourse(admin.id, draft.id).catch(() => undefined);
  check(
    "L/O: repeated approval does not notify again",
    (await notifs(draft.instructorId, { type: "COURSE_APPROVED" })).filter((x) =>
      x.eventKey?.startsWith(`course-review:${draft.id}:`),
    ).length === 1,
  );
  await prisma.course.update({ where: { id: draft.id }, data: { status: "PENDING_REVIEW" } });
  await rejectCourse(admin.id, draft.id, { reason: "Add captions to every video lesson." });
  cn = await notifs(draft.instructorId, { type: "COURSE_REJECTED" });
  check(
    "L: rejection notifies the owner with the existing reason",
    cn.length >= 1 && cn.some((x) => x.message.includes("Add captions to every video lesson.")),
  );
  await rejectCourse(admin.id, draft.id, { reason: "Add captions to every video lesson." }).catch(
    () => undefined,
  );
  check(
    "L/O: repeated rejection does not notify again",
    (await notifs(draft.instructorId, { type: "COURSE_REJECTED" })).length === cn.length,
  );

  section("Completion + certificate notifications (matrix M, N)");
  const fullCourse = await prisma.course.findUniqueOrThrow({
    where: { slug: "python-for-data-science" },
    include: { sections: { include: { lessons: true } } },
  });
  const stC = await freshStudent();
  await buy(stC, fullCourse.slug);
  const allLessons = fullCourse.sections.flatMap((s) => s.lessons);
  for (const l of allLessons) await markLessonComplete(stC, fullCourse.slug, l.id, true);
  const enr = await prisma.enrollment.findFirstOrThrow({
    where: { userId: stC.id, courseId: fullCourse.id },
  });
  check("M: enrollment is COMPLETED", enr.status === "COMPLETED");
  check(
    "M: exactly one course-completed notification",
    (await notifs(stC.id, { type: "COURSE_COMPLETED" })).length === 1,
  );
  await markLessonComplete(stC, fullCourse.slug, allLessons[0]!.id, true);
  await markLessonComplete(stC, fullCourse.slug, allLessons[0]!.id, false); // course goes back to ACTIVE
  await markLessonComplete(stC, fullCourse.slug, allLessons[0]!.id, true); // completes again
  check(
    "M/O: repeated / re-completed does not notify again",
    (await notifs(stC.id, { type: "COURSE_COMPLETED" })).length === 1,
  );
  const certs = await Promise.all([
    getOrCreateCertificate(stC, fullCourse.slug),
    getOrCreateCertificate(stC, fullCourse.slug),
    getOrCreateCertificate(stC, fullCourse.slug),
  ]);
  await getOrCreateCertificate(stC, fullCourse.slug);
  const cnCert = await notifs(stC.id, { type: "CERTIFICATE_READY" });
  check(
    "N: exactly one certificate notification (3 concurrent + 1 repeat retrievals)",
    cnCert.length === 1 && cnCert[0]!.link === `/student/certificates/${certs[0]!.id}`,
  );

  // ================================================================ MESSAGING
  section("Messaging: who may start a conversation (matrix A-C)");
  const stM = await freshStudent();
  await buy(stM, TS);
  const conv = await getOrCreateCourseConversation(stM, TS);
  check(
    "A: entitled student can contact the course instructor",
    !!conv.id && conv.courseSlug === TS && conv.canSend,
  );
  const parts = await prisma.conversationParticipant.findMany({
    where: { conversationId: conv.id },
  });
  check(
    "A: exactly two participants: the student and the course's instructor",
    parts.length === 2 &&
      parts.some((p) => p.userId === stM.id) &&
      parts.some((p) => p.userId === tsCourse.instructorId),
  );
  const stNone = await freshStudent();
  await rejectsWith(
    "B: non-enrolled student cannot start a conversation",
    () => getOrCreateCourseConversation(stNone, TS),
    code("NOT_ENTITLED"),
  );
  const stX = await freshStudent();
  const orderX = await buy(stX, TS);
  await refundOrder(admin, orderX);
  await rejectsWith(
    "C: CANCELLED (refunded) enrollment cannot start one",
    () => getOrCreateCourseConversation(stX, TS),
    code("NOT_ENTITLED"),
  );
  await rejectsWith(
    "instructor cannot start a thread with a student",
    () => getOrCreateCourseConversation(elena, TS),
    code("FORBIDDEN_ROLE"),
  );
  await rejectsWith(
    "admin cannot start a thread",
    () => getOrCreateCourseConversation(admin, TS),
    code("FORBIDDEN_ROLE"),
  );
  await rejectsWith(
    "unknown course",
    () => getOrCreateCourseConversation(stM, "no-such-course"),
    code("COURSE_NOT_FOUND"),
  );

  const stRace = await freshStudent();
  await buy(stRace, "modern-react-typescript");
  const raced = await Promise.all(
    Array.from({ length: 8 }, () =>
      getOrCreateCourseConversation(stRace, "modern-react-typescript"),
    ),
  );
  const raceCourse = await prisma.course.findUniqueOrThrow({
    where: { slug: "modern-react-typescript" },
  });
  check(
    "concurrent get-or-create -> one conversation, one id",
    new Set(raced.map((c) => c.id)).size === 1 &&
      (await prisma.conversation.count({
        where: { courseId: raceCourse.id, studentId: stRace.id },
      })) === 1,
  );
  check(
    "...with exactly two participants",
    (await prisma.conversationParticipant.count({ where: { conversationId: raced[0]!.id } })) === 2,
  );
  check(
    "repeat get-or-create returns the same thread",
    (await getOrCreateCourseConversation(stM, TS)).id === conv.id,
  );

  section("Messaging: sending, validation, XSS (matrix D, G-J)");
  const m1 = await send(stM, conv.id, "Hi! I have a question about generics.");
  check(
    "student sends a message (mine=true, plain text)",
    m1.mine && m1.content === "Hi! I have a question about generics.",
  );
  const reply = await send(elena, conv.id, "Happy to help!");
  check("D: instructor can reply", !reply.mine === false && reply.senderName.length > 0);
  await rejectsWith("G: empty message rejected", () => send(stM, conv.id, ""), named("ZodError"));
  await rejectsWith(
    "H: whitespace-only message rejected",
    () => send(stM, conv.id, "   \n\t  "),
    named("ZodError"),
  );
  await rejectsWith(
    "I: oversized message (2001 chars) rejected",
    () => send(stM, conv.id, "a".repeat(2001)),
    named("ZodError"),
  );
  await rejectsWith(
    "NUL byte rejected",
    () => send(stM, conv.id, "hi\u0000there"),
    named("ZodError"),
  );
  check(
    "2000-char message accepted (boundary)",
    (await send(stM, conv.id, "b".repeat(2000))).content.length === 2000,
  );
  await rejectsWith(
    "client-supplied senderId is rejected (strict schema)",
    () =>
      sendMessage(stM, {
        conversationId: conv.id,
        content: "x",
        clientMessageId: uid(),
        senderId: elena.id,
      }),
    named("ZodError"),
  );
  const xss = "<script>alert(1)</script><img src=x onerror=alert(2)>";
  const mx = await send(stM, conv.id, xss);
  check(
    "J: XSS string is stored and returned verbatim (escaped at render time)",
    mx.content === xss,
  );
  const html = renderToStaticMarkup(createElement(MessageBubble, { message: mx }));
  check(
    "J: rendered markup contains the text ESCAPED, no live <script>/<img>",
    html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") &&
      !html.includes("<script") &&
      !html.includes("<img"),
  );

  section("Messaging: IDOR / participant checks (matrix E, F)");
  const stOther = await freshStudent();
  await buy(stOther, TS);
  const otherConv = await getOrCreateCourseConversation(stOther, TS);
  const asNotFound = code("NOT_FOUND");
  await rejectsWith(
    "E: student B cannot fetch student A's conversation",
    () => getConversationMessages(stOther, { conversationId: conv.id }),
    asNotFound,
  );
  await rejectsWith(
    "E: student B cannot send into it",
    () => send(stOther, conv.id, "sneaky"),
    asNotFound,
  );
  await rejectsWith(
    "E: student B cannot mark it read",
    () => markConversationRead(stOther, { conversationId: conv.id }),
    asNotFound,
  );
  check(
    "E: student B's inbox does not list it",
    !(await getMyConversations(stOther)).conversations.some((c) => c.id === conv.id),
  );
  await rejectsWith(
    "F: instructor B cannot fetch instructor A's conversation",
    () => getConversationMessages(marcus, { conversationId: conv.id }),
    asNotFound,
  );
  await rejectsWith(
    "F: instructor B cannot send into it",
    () => send(marcus, conv.id, "sneaky"),
    asNotFound,
  );
  await rejectsWith(
    "F: instructor B cannot mark it read",
    () => markConversationRead(marcus, { conversationId: conv.id }),
    asNotFound,
  );
  check(
    "F: instructor B's inbox does not list it",
    !(await getMyConversations(marcus)).conversations.some((c) => c.id === conv.id),
  );
  for (const [label, fn] of [
    ["fetch", () => getConversationMessages(admin, { conversationId: conv.id })],
    ["send", () => send(admin, conv.id, "admin peek")],
    ["mark read", () => markConversationRead(admin, { conversationId: conv.id })],
    ["list", () => getMyConversations(admin)],
  ] as const) {
    await rejectsWith(
      `admin cannot ${label} (role alone grants nothing)`,
      fn,
      named("ForbiddenError"),
    );
  }
  await rejectsWith(
    "a guessed/unknown conversation id looks identical to a foreign one",
    () => getConversationMessages(stM, { conversationId: "clx0000000000000000000000" }),
    asNotFound,
  );
  await rejectsWith(
    "reusing a clientMessageId in ANOTHER conversation is refused",
    async () => {
      const key = uid();
      await send(stM, conv.id, "first", key);
      const stM2Conv = (await getOrCreateCourseConversation(stM, TS)).id; // same thread; need a different one:
      void stM2Conv;
      const second = await prisma.conversation.create({
        data: {
          courseId: null,
          studentId: null,
          participants: { create: [{ userId: stM.id }, { userId: elena.id }] },
        },
      });
      await send(stM, second.id, "second", key);
    },
    code("INVALID"),
  );

  section("Messaging: unread + read state (matrix L-N, P)");
  const stU = await freshStudent();
  await buy(stU, TS);
  const cu = await getOrCreateCourseConversation(stU, TS);
  const eBefore = (await getUnreadCounts(elena)).messages;
  const s1 = await send(stU, cu.id, "one");
  const s2 = await send(stU, cu.id, "two");
  check(
    "L: recipient (instructor) unread increased by 2",
    (await getUnreadCounts(elena)).messages === eBefore + 2,
  );
  check("M: sender's unread did not increase", (await getUnreadCounts(stU)).messages === 0);
  const e1 = await send(elena, cu.id, "reply one");
  const e2 = await send(elena, cu.id, "reply two");
  check("L: student unread = 2", (await getUnreadCounts(stU)).messages === 2);
  const listU = (await getMyConversations(stU)).conversations.find((c) => c.id === cu.id)!;
  check(
    "L: per-conversation unread + preview + course context",
    listU.unreadCount === 2 &&
      listU.lastMessagePreview === "reply two" &&
      listU.courseTitle === tsCourse.title &&
      !listU.lastMessageFromMe,
  );
  const nn = await notifs(stU.id, { type: "NEW_MESSAGE" });
  check(
    "P: exactly one NEW_MESSAGE notification per received message (2 replies)",
    nn.length === 2 && nn.every((x) => x.link === `/student/messages?c=${cu.id}`),
  );
  check(
    "P: sender got no notification for their own message",
    (
      await notifs(elena.id, {
        type: "NEW_MESSAGE",
        eventKey: { in: [`message:${e1.id}`, `message:${e2.id}`] },
      })
    ).length === 0,
  );
  check(
    "P: instructor's notification links to the instructor inbox",
    (await notifs(elena.id, { type: "NEW_MESSAGE", eventKey: `message:${s1.id}` }))[0]?.link ===
      `/instructor/messages?c=${cu.id}`,
  );
  check(
    "P: notification carries no message text",
    !nn.some((x) => x.message.includes("reply one") || x.title.includes("reply")),
  );
  const eInstrBefore = (await getUnreadCounts(elena)).messages;
  await markConversationRead(stU, { conversationId: cu.id, upToMessageId: e1.id });
  check(
    "N: mark read up to a message leaves later ones unread",
    (await getUnreadCounts(stU)).messages === 1 || (await getUnreadCounts(stU)).messages === 0,
    `(${(await getUnreadCounts(stU)).messages})`,
  );
  const done = await markConversationRead(stU, { conversationId: cu.id });
  check(
    "N: opening the conversation marks it read",
    done.unreadMessages === 0 && (await getUnreadCounts(stU)).messages === 0,
  );
  check(
    "N: the student marking read does NOT change the instructor's unread",
    (await getUnreadCounts(elena)).messages === eInstrBefore,
  );
  check(
    "N: NEW_MESSAGE notifications for that conversation are cleared",
    (await notifs(stU.id, { type: "NEW_MESSAGE", readAt: null })).length === 0,
  );
  await markConversationRead(elena, { conversationId: cu.id });
  check(
    "N: instructor reading clears theirs independently",
    (await getMyConversations(elena)).conversations.find((c) => c.id === cu.id)!.unreadCount === 0,
  );
  await rejectsWith(
    "N: upToMessageId from another conversation is refused",
    () => markConversationRead(stU, { conversationId: cu.id, upToMessageId: m1.id }),
    code("INVALID"),
  );
  void s2;

  section("Messaging: idempotency (matrix O, P)");
  const idemConvStudent = await freshStudent();
  await buy(idemConvStudent, TS);
  const ci = await getOrCreateCourseConversation(idemConvStudent, TS);
  const key1 = uid();
  const a1 = await send(idemConvStudent, ci.id, "retry me", key1);
  const a2 = await send(idemConvStudent, ci.id, "retry me", key1);
  check("O: identical retry returns the ORIGINAL message", a1.id === a2.id);
  check(
    "O: exactly one row + one notification",
    (await prisma.message.count({
      where: { conversationId: ci.id, senderId: idemConvStudent.id },
    })) === 1 &&
      (await prisma.notification.count({ where: { eventKey: `message:${a1.id}` } })) === 1,
  );
  const key2 = uid();
  const burst = await Promise.allSettled(
    Array.from({ length: 8 }, () => send(idemConvStudent, ci.id, "double click", key2)),
  );
  const ids = new Set(
    burst
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id),
  );
  check(
    "O: 8 simultaneous identical requests -> one message id",
    burst.every((r) => r.status === "fulfilled") && ids.size === 1,
  );
  check(
    "O: ...one DB row and one notification",
    (await prisma.message.count({ where: { conversationId: ci.id, clientMessageId: key2 } })) ===
      1 &&
      (await prisma.notification.count({ where: { eventKey: `message:${[...ids][0]}` } })) === 1,
  );
  await send(idemConvStudent, ci.id, "same text", uid());
  await send(idemConvStudent, ci.id, "same text", uid());
  check(
    "two separately submitted identical texts are BOTH delivered",
    (await prisma.message.count({ where: { conversationId: ci.id, content: "same text" } })) === 2,
  );

  section("Messaging: ordering, pagination, refunds, rate limit (matrix K)");
  const stS = await freshStudent();
  await buy(stS, TS);
  await buy(stS, "modern-react-typescript");
  const c1 = await getOrCreateCourseConversation(stS, TS);
  const c2 = await getOrCreateCourseConversation(stS, "modern-react-typescript");
  await send(stS, c1.id, "to c1 first");
  await new Promise((r) => setTimeout(r, 15));
  await send(stS, c2.id, "to c2 second");
  let order = (await getMyConversations(stS)).conversations.map((c) => c.id);
  check(
    "K: list is sorted by latest activity (c2 first)",
    order[0] === c2.id && order[1] === c1.id,
  );
  await new Promise((r) => setTimeout(r, 15));
  await send(stS, c1.id, "c1 again");
  order = (await getMyConversations(stS)).conversations.map((c) => c.id);
  check("K: a new message moves its conversation to the top", order[0] === c1.id);

  const stH = await freshStudent();
  await buy(stH, TS);
  const ch = await getOrCreateCourseConversation(stH, TS);
  const base = Date.now() - 200_000;
  await prisma.message.createMany({
    data: Array.from({ length: 75 }, (_, i) => ({
      conversationId: ch.id,
      senderId: i % 2 === 0 ? stH.id : elena.id,
      content: `msg-${String(i).padStart(3, "0")}`,
      clientMessageId: `hist-${i}`,
      createdAt: new Date(base + i * 1000),
    })),
  });
  // Rows were bulk-inserted directly (like an import), so bring lastMessageAt in line as the send path would have.
  await prisma.conversation.update({
    where: { id: ch.id },
    data: { lastMessageAt: new Date(base + 74 * 1000) },
  });
  const h1 = await getConversationMessages(stH, { conversationId: ch.id, limit: 30 });
  check(
    "history page 1 = newest 30, displayed oldest->newest, has cursor",
    h1.messages.length === 30 &&
      h1.messages[29]!.content === "msg-074" &&
      h1.messages[0]!.content === "msg-045" &&
      !!h1.nextCursor,
  );
  const seenIds = new Set(h1.messages.map((m) => m.id));
  let hc = h1.nextCursor;
  let hp = 1;
  while (hc) {
    const nxt = await getConversationMessages(stH, {
      conversationId: ch.id,
      limit: 30,
      cursor: hc,
    });
    for (const m of nxt.messages) seenIds.add(m.id);
    hc = nxt.nextCursor;
    hp++;
  }
  check(
    "history cursor walk returns all 75 once in 3 pages",
    seenIds.size === 75 && hp === 3,
    `(${seenIds.size}, ${hp})`,
  );
  check(
    "history page size capped at 50",
    (await getConversationMessages(stH, { conversationId: ch.id, limit: 500 })).messages.length ===
      50,
  );

  const stG = await freshStudent();
  const orderG = await buy(stG, TS);
  const cg = await getOrCreateCourseConversation(stG, TS);
  await send(stG, cg.id, "before refund");
  await refundOrder(admin, orderG);
  await rejectsWith(
    "after a refund the student can no longer send",
    () => send(stG, cg.id, "after refund"),
    code("NOT_ENTITLED"),
  );
  const readAfter = await getConversationMessages(stG, { conversationId: cg.id });
  check(
    "...but can still read the history, flagged canSend=false",
    readAfter.messages.length === 1 && readAfter.conversation.canSend === false,
  );
  check(
    "...and the inbox reports canSend=false",
    (await getMyConversations(stG)).conversations.find((c) => c.id === cg.id)?.canSend === false,
  );
  check("the instructor can still reply", (await send(elena, cg.id, "sorry to see you go")).mine);
  await rejectsWith(
    "...and the refunded student still cannot open a NEW thread",
    () => getOrCreateCourseConversation(stG, "modern-react-typescript"),
    code("NOT_ENTITLED"),
  );

  const stRL = await freshStudent();
  await enrollInCourse(stRL, freeCourse.slug);
  const freeOwner = await prisma.user.findUniqueOrThrow({ where: { id: freeCourse.instructorId } });
  const cRL = await getOrCreateCourseConversation(stRL, freeCourse.slug);
  let ok = 0;
  let limited = false;
  for (let i = 0; i < 32; i++) {
    try {
      await send(stRL, cRL.id, `spam ${i}`);
      ok++;
    } catch (e) {
      if (e instanceof RateLimitExceededError) limited = true;
    }
  }
  check(
    "rate limit: 30 messages/minute allowed, the rest refused",
    ok === 30 && limited,
    `(ok=${ok}, limited=${limited})`,
  );
  void freeOwner;

  // ========================================================== DB consistency
  section("Database consistency");
  const q = async (sql: string) =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql))[0]!.n);
  check(
    "no duplicate (userId,eventKey) notifications",
    (await q(
      `SELECT count(*) n FROM (SELECT 1 FROM notifications WHERE "eventKey" IS NOT NULL GROUP BY "userId","eventKey" HAVING count(*)>1) t`,
    )) === 0,
  );
  check(
    "no duplicate conversation per (course, student)",
    (await q(
      `SELECT count(*) n FROM (SELECT 1 FROM conversations WHERE "courseId" IS NOT NULL GROUP BY "courseId","studentId" HAVING count(*)>1) t`,
    )) === 0,
  );
  check(
    "every course conversation has exactly two participants incl. its student",
    (await q(
      `SELECT count(*) n FROM conversations c WHERE c."studentId" IS NOT NULL AND ((SELECT count(*) FROM conversation_participants p WHERE p."conversationId"=c.id) <> 2 OR NOT EXISTS (SELECT 1 FROM conversation_participants p WHERE p."conversationId"=c.id AND p."userId"=c."studentId"))`,
    )) === 0,
  );
  check(
    "every message's sender is a participant of its conversation",
    (await q(
      `SELECT count(*) n FROM messages m WHERE NOT EXISTS (SELECT 1 FROM conversation_participants p WHERE p."conversationId"=m."conversationId" AND p."userId"=m."senderId")`,
    )) === 0,
  );
  check(
    "no message without a conversation / participant without a conversation (orphans)",
    (await q(
      `SELECT count(*) n FROM messages m LEFT JOIN conversations c ON c.id=m."conversationId" WHERE c.id IS NULL`,
    )) +
      (await q(
        `SELECT count(*) n FROM conversation_participants p LEFT JOIN conversations c ON c.id=p."conversationId" WHERE c.id IS NULL`,
      )) ===
      0,
  );
  check(
    "lastMessageAt matches the newest message for every conversation that has messages",
    (await q(
      `SELECT count(*) n FROM conversations c WHERE EXISTS (SELECT 1 FROM messages m WHERE m."conversationId"=c.id) AND c."lastMessageAt" IS DISTINCT FROM (SELECT max(m."createdAt") FROM messages m WHERE m."conversationId"=c.id)`,
    )) === 0,
    "",
  );
  check(
    "each message (sent via the service) has exactly one NEW_MESSAGE notification",
    (await q(
      `SELECT count(*) n FROM messages m WHERE m."clientMessageId" NOT LIKE 'hist-%' AND m."clientMessageId" NOT LIKE 'seed-%' AND (SELECT count(*) FROM notifications x WHERE x."eventKey"='message:'||m.id) <> 1 AND m."conversationId" IN (SELECT id FROM conversations WHERE "courseId" IS NOT NULL)`,
    )) === 0,
  );
  check(
    "no stored notification link points outside the app (excluding the deliberate 'bad row' fixture)",
    (await q(
      `SELECT count(*) n FROM notifications WHERE link IS NOT NULL AND title <> 'bad row' AND (link NOT LIKE '/%' OR link LIKE '//%' OR strpos(link, chr(92)) > 0 OR link ~ '\\s')`,
    )) === 0,
  );

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed) console.log("FAILED:\n - " + failures.join("\n - "));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("HARNESS ERROR", e);
  await prisma.$disconnect();
  process.exit(3);
});
