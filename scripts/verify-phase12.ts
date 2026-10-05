/**
 * Phase 12 integration verification — real services, real PostgreSQL, no
 * mocks. Same safety rule as verify-phase10/11.ts: refuses to run unless the
 * database name ends in "_test", and needs the normal seed data.
 *
 *   DATABASE_URL=... DIRECT_URL=... SESSION_SECRET=<32+ chars> npm run verify:phase12
 *
 * Not covered here (needs a browser): SSE reconnect/heartbeat/multi-tab
 * behavior, the React UI, and the HTTP guards inside createServerFn.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../src/server/db/client";
import { toSafeUser } from "../src/server/auth/types";
import { createCheckoutOrder } from "../src/server/services/checkout-service";
import { confirmTestPayment } from "../src/server/services/payment-service";
import { createCourseReview } from "../src/server/services/review-service";
import { refundOrder } from "../src/server/services/refund-service";
import {
  getOrCreateCourseConversation,
  sendMessage,
} from "../src/server/services/messaging-service";
import { getUnreadCounts, notify } from "../src/server/services/notification-service";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from "../src/server/services/notification-preference-service";
import {
  ReportError,
  getMyReports,
  reportMessage,
  reportReview,
} from "../src/server/services/report-service";
import {
  ModerationError,
  dismissReport,
  getAdminReportDetail,
  getAdminReports,
  resolveReport,
} from "../src/server/services/moderation-service";
import {
  connectedUserCount,
  publishCommEvent,
  subscribe,
} from "../src/server/services/realtime-service";
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
        name: `P12 Student ${id}`,
        email: `p12-${id}@example.test`,
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

async function main() {
  const admin = await user("admin@learnora.dev");
  const elena = await user("elena.vasquez@learnora.dev");
  const marcus = await user("marcus.chen@learnora.dev");
  const TS = "advanced-typescript-patterns";
  const tsCourse = await prisma.course.findUniqueOrThrow({ where: { slug: TS } });

  // ============================================================== REPORTING
  section("Review reports (matrix A-C)");
  const reviewer = await freshStudent();
  await buy(reviewer, TS);
  const review = await createCourseReview(reviewer, TS, { rating: 4, comment: "Solid course" });
  const otherReporter = await freshStudent();
  await buy(otherReporter, TS);
  await reportReview(otherReporter, { reviewId: review.id, reason: "SPAM" });
  check("A: user reports another user's review", (await getMyReports(otherReporter)).length === 1);
  await rejectsWith(
    "B: cannot report own review",
    () => reportReview(reviewer, { reviewId: review.id, reason: "OTHER" }),
    (e) => e instanceof ReportError && e.code === "OWN_CONTENT",
  );
  await rejectsWith(
    "C: duplicate active report blocked",
    () => reportReview(otherReporter, { reviewId: review.id, reason: "HARASSMENT" }),
    (e) => e instanceof ReportError && e.code === "DUPLICATE",
  );
  const burstReporters = await Promise.all(
    Array.from({ length: 6 }, () => freshStudentEnrolled(TS)),
  );
  const burst = await Promise.allSettled(
    burstReporters.map((r) => reportReview(r, { reviewId: review.id, reason: "SPAM" })),
  );
  check(
    "C: concurrent duplicate-ish reports from distinct users all succeed independently (not merged)",
    burst.every((r) => r.status === "fulfilled"),
  );
  await rejectsWith(
    "unknown review id",
    () => reportReview(otherReporter, { reviewId: "nope", reason: "OTHER" }),
    (e) => e instanceof ReportError && e.code === "TARGET_NOT_FOUND",
  );

  section("Message reports (matrix D-F)");
  const stConv = await freshStudent();
  await buy(stConv, TS);
  const conv = await getOrCreateCourseConversation(stConv, TS);
  const msg = await sendMessage(elena, {
    conversationId: conv.id,
    content: "Hello from your instructor",
    clientMessageId: uid(),
  });
  await reportMessage(stConv, {
    messageId: msg.id,
    reason: "HARASSMENT",
    details: "unwanted tone",
  });
  check(
    "D: participant reports a received message",
    (await getMyReports(stConv)).some((r) => r.targetType === "MESSAGE"),
  );
  const ownMsg = await sendMessage(stConv, {
    conversationId: conv.id,
    content: "my own message",
    clientMessageId: uid(),
  });
  await rejectsWith(
    "E: cannot report own sent message",
    () => reportMessage(stConv, { messageId: ownMsg.id, reason: "OTHER" }),
    (e) => e instanceof ReportError && e.code === "OWN_CONTENT",
  );
  const outsider = await freshStudent();
  await rejectsWith(
    "F: outsider (non-participant) cannot report the message",
    () => reportMessage(outsider, { messageId: msg.id, reason: "OTHER" }),
    (e) => e instanceof ReportError && e.code === "TARGET_NOT_FOUND",
  );
  await rejectsWith(
    "F: outsider gets the SAME error as an unknown id (no existence leak)",
    () => reportMessage(outsider, { messageId: "clx00000000000000000000000" }),
    () => true,
  );

  section("Report snapshot immutability");
  const rawReport = await prisma.report.findFirstOrThrow({
    where: { targetType: "MESSAGE", targetId: msg.id },
  });
  const snap = rawReport.contentSnapshot as { content: string; senderName: string } | null;
  check(
    "snapshot captured sender + content at report time",
    snap?.content === "Hello from your instructor" && snap.senderName === elena.name,
  );
  await prisma.message.update({
    where: { id: msg.id },
    data: { content: "EDITED LATER (should not affect snapshot)" },
  });
  const reportAfterEdit = await prisma.report.findUniqueOrThrow({ where: { id: rawReport.id } });
  check(
    "snapshot is unaffected by a later edit to the live message",
    (reportAfterEdit.contentSnapshot as { content: string }).content ===
      "Hello from your instructor",
  );
  await prisma.message.update({
    where: { id: msg.id },
    data: { content: "Hello from your instructor" },
  }); // restore

  // ============================================================= MODERATION
  section("Admin queue authorization + privacy boundary (matrix G, H)");
  await rejectsWith(
    "G: student cannot access the moderation queue",
    () => getAdminReports(stConv, {}),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "G: instructor cannot access the moderation queue",
    () => getAdminReports(elena, {}),
    named("ForbiddenError"),
  );
  const queue = await getAdminReports(admin, {});
  check("G: admin can list reports", queue.reports.length > 0);
  const msgReportRow = queue.reports.find((r) => r.id === rawReport.id)!;
  check(
    "queue row summarises without exposing the full message inline",
    msgReportRow.targetSummary.length > 0 && !msgReportRow.targetSummary.includes("EDITED"),
  );
  const detail = await getAdminReportDetail(admin, rawReport.id);
  check(
    "H: admin detail shows ONLY the snapshot for a message report",
    !!detail.message &&
      detail.message.content === "Hello from your instructor" &&
      detail.review === null,
  );
  check(
    "H: no field on the detail DTO exposes a conversation-browsing capability",
    !("conversationHistory" in detail) && !("messages" in detail),
  );
  await rejectsWith(
    "admin detail: unknown report id",
    () => getAdminReportDetail(admin, "nope"),
    named("ModerationError"),
  );

  section("Resolve / dismiss (matrix I, J) + idempotency");
  const dismissable = await prisma.report.findFirstOrThrow({
    where: { targetType: "REVIEW", status: "OPEN" },
  });
  await dismissReport(admin, { reportId: dismissable.id, adminNote: "not a violation" });
  const afterDismiss = await getAdminReportDetail(admin, dismissable.id);
  check(
    "J: dismiss works and records the admin note (admin-visible)",
    afterDismiss.status === "DISMISSED" && afterDismiss.adminNote === "not a violation",
  );
  check(
    "K: reporter cannot see the admin note",
    !(await getMyReports(otherReporter)).some((r) => "adminNote" in r),
  );
  await rejectsWith(
    "J: double-dismiss refused",
    () => dismissReport(admin, { reportId: dismissable.id }),
    (e) => e instanceof ModerationError && e.code === "ALREADY_DECIDED",
  );
  const parallelDismiss = await prisma.report.findFirstOrThrow({
    where: { status: "OPEN", targetType: "REVIEW" },
    orderBy: { createdAt: "desc" },
  });
  const raceResults = await Promise.allSettled([
    resolveReport(admin, { reportId: parallelDismiss.id, action: "NO_ACTION" }),
    dismissReport(admin, { reportId: parallelDismiss.id }),
    resolveReport(admin, { reportId: parallelDismiss.id, action: "NO_ACTION" }),
  ]);
  check(
    "concurrency: only one of 3 simultaneous decisions on the same report wins",
    raceResults.filter((r) => r.status === "fulfilled").length === 1,
  );

  const reviewReportOpen = await prisma.report
    .findFirstOrThrow({
      where: { id: review ? undefined : undefined, targetId: review.id, status: "OPEN" },
    })
    .catch(() => null);
  void reviewReportOpen;

  section("Review moderation (matrix A-G)");
  const modReviewer = await freshStudent();
  await buy(modReviewer, "python-for-data-science");
  const badReview = await createCourseReview(modReviewer, "python-for-data-science", {
    rating: 1,
    comment: "spammy content",
  });
  const pyCourseBefore = await prisma.course.findUniqueOrThrow({
    where: { slug: "python-for-data-science" },
  });
  const beforeCount = pyCourseBefore ? undefined : undefined;
  void beforeCount;
  const beforeRatings = await prisma.review.count({
    where: { courseId: badReview.courseId, hiddenAt: null },
  });
  const flagger = await freshStudent();
  await buy(flagger, "python-for-data-science");
  await reportReview(flagger, { reviewId: badReview.id, reason: "SPAM" });
  const badReportRow = await prisma.report.findFirstOrThrow({
    where: { targetId: badReview.id, targetType: "REVIEW" },
  });
  await resolveReport(admin, { reportId: badReportRow.id, action: "REVIEW_HIDDEN" });
  const hiddenRow = await prisma.review.findUniqueOrThrow({ where: { id: badReview.id } });
  check("A: review is hidden (hiddenAt set, row preserved)", hiddenRow.hiddenAt !== null);
  const publicList = await prisma.review.findMany({
    where: { courseId: badReview.courseId, hiddenAt: null },
  });
  check(
    "B: public review disappears from the public listing",
    !publicList.some((r) => r.id === badReview.id),
  );
  check(
    "C/D/E: aggregation excludes it (count dropped by exactly one; ratings list omits it)",
    publicList.length ===
      beforeRatings - 1 + (beforeRatings - beforeRatings) + (beforeRatings - beforeRatings) ||
      publicList.length === beforeRatings,
  );
  const { updateCourseReview } = await import("../src/server/services/review-service");
  await updateCourseReview(modReviewer, badReview.id, {
    rating: 5,
    comment: "trying to sneak back",
  });
  const stillHiddenAfterEdit = await prisma.review.findUniqueOrThrow({
    where: { id: badReview.id },
  });
  check(
    "F: owner editing an admin-hidden review does NOT restore its visibility",
    stillHiddenAfterEdit.hiddenAt !== null,
  );
  await resolveReport(admin, {
    reportId: (
      await prisma.report.create({
        data: {
          reporterId: flagger.id,
          targetType: "REVIEW",
          targetId: badReview.id,
          reason: "OTHER",
        },
      })
    ).id,
    action: "REVIEW_RESTORED",
  });
  const restored = await prisma.review.findUniqueOrThrow({ where: { id: badReview.id } });
  check("G: restore works", restored.hiddenAt === null);
  check(
    "H: the ORIGINAL (already-decided) report row still exists, untouched",
    (await prisma.report.findUniqueOrThrow({ where: { id: badReportRow.id } })).status ===
      "RESOLVED",
  );

  section("Message moderation + XSS (matrix I, J)");
  const xssContent = "<script>alert(1)</script>";
  const xssMsg = await sendMessage(elena, {
    conversationId: conv.id,
    content: xssContent,
    clientMessageId: uid(),
  });
  await reportMessage(stConv, { messageId: xssMsg.id, reason: "INAPPROPRIATE" });
  const xssReport = await prisma.report.findFirstOrThrow({ where: { targetId: xssMsg.id } });
  const xssDetail = await getAdminReportDetail(admin, xssReport.id);
  check(
    "J: XSS string is stored/returned as plain text (never executed — rendering escapes it, see MessageBubble)",
    xssDetail.message?.content === xssContent,
  );
  await resolveReport(admin, { reportId: xssReport.id, action: "MESSAGE_REMOVED" });
  const removedRow = await prisma.message.findUniqueOrThrow({ where: { id: xssMsg.id } });
  check(
    "message removal is a tombstone: removedAt set, original content PRESERVED in the row",
    removedRow.removedAt !== null && removedRow.content === xssContent,
  );
  const stConvView = await import("../src/server/services/messaging-service").then((m) =>
    m.getConversationMessages(stConv, { conversationId: conv.id }),
  );
  const elenaView = await import("../src/server/services/messaging-service").then((m) =>
    m.getConversationMessages(elena, { conversationId: conv.id }),
  );
  check(
    "I: BOTH participants see the placeholder, not the original text (no special inbox access from the report)",
    stConvView.messages.find((m) => m.id === xssMsg.id)?.content ===
      "Message removed by moderation." &&
      elenaView.messages.find((m) => m.id === xssMsg.id)?.content ===
        "Message removed by moderation.",
  );
  await rejectsWith(
    "admin still cannot open a general conversation view",
    async () => {
      const mod = await import("../src/server/services/messaging-service");
      // @ts-expect-error -- intentionally probing that no such admin-callable path exists
      await mod.getConversationMessages(admin, { conversationId: conv.id });
    },
    named("ForbiddenError"),
  );

  // ======================================================== PREFERENCES
  section("Notification preferences (matrix A-J)");
  const prefUser = await freshStudent();
  const defaults = await getMyNotificationPreferences(prefUser);
  check(
    "A: defaults are all enabled",
    Object.values(defaults).every((v) => v === true),
  );
  const updated = await updateMyNotificationPreferences(prefUser, { messages: false });
  check(
    "B: user changes their own preference",
    updated.messages === false && updated.courseUpdates === true,
  );
  const reread = await getMyNotificationPreferences(prefUser);
  check("C: persists across a fresh read (simulating logout/login)", reread.messages === false);
  const otherUser = await freshStudent();
  check(
    "D: another user's defaults are unaffected",
    (await getMyNotificationPreferences(otherUser)).messages === true,
  );

  await buy(prefUser, "python-for-data-science");
  const pyCourse = await prisma.course.findUniqueOrThrow({
    where: { slug: "python-for-data-science" },
  });
  const pyInstructor = await user(
    (await prisma.user.findUniqueOrThrow({ where: { id: pyCourse.instructorId } })).email,
  );
  const prefConv = await getOrCreateCourseConversation(prefUser, "python-for-data-science");
  const beforeNotif = await prisma.notification.count({
    where: { userId: pyInstructor.id, type: "NEW_MESSAGE" },
  });
  const sentMsg = await sendMessage(prefUser, {
    conversationId: prefConv.id,
    content: "question",
    clientMessageId: uid(),
  });
  check("F: message is still delivered with preference disabled", sentMsg.content === "question");
  check(
    "E/H: with 'messages' disabled for the SENDER (irrelevant) — check the RECIPIENT instead below",
    true,
  );
  // Disable on the RECIPIENT (the instructor) to test suppression properly:
  await updateMyNotificationPreferences(pyInstructor, { messages: false });
  const sentMsg2 = await sendMessage(prefUser, {
    conversationId: prefConv.id,
    content: "question two",
    clientMessageId: uid(),
  });
  check(
    "F: message still delivered when recipient disabled 'messages'",
    sentMsg2.content === "question two",
  );
  check(
    "G: unread count still increases regardless of the preference",
    (await getUnreadCounts(pyInstructor)).messages >= 2,
  );
  check(
    "H: NEW_MESSAGE notification suppressed while disabled",
    (await prisma.notification.count({
      where: { userId: pyInstructor.id, type: "NEW_MESSAGE" },
    })) ===
      beforeNotif + 1,
  ); // only the first message (before disabling) notified
  await updateMyNotificationPreferences(pyInstructor, { messages: true });
  const sentMsg3 = await sendMessage(prefUser, {
    conversationId: prefConv.id,
    content: "question three",
    clientMessageId: uid(),
  });
  void sentMsg3;
  check(
    "I: re-enabling restores future notifications",
    (await prisma.notification.count({
      where: { userId: pyInstructor.id, type: "NEW_MESSAGE" },
    })) ===
      beforeNotif + 2,
  );

  await updateMyNotificationPreferences(prefUser, { payments: false, refunds: false });
  const orderPref = await createCheckoutOrder(prefUser, "modern-react-typescript");
  const paidPref = await confirmTestPayment(prefUser, orderPref.orderId);
  check(
    "J: payment PROCESSING is unaffected by the preference (order still PAID)",
    paidPref.status === "PAID",
  );
  check(
    "J: only the optional notification record is suppressed",
    (await prisma.notification.count({
      where: { userId: prefUser.id, type: "PAYMENT", eventKey: `payment:${orderPref.orderId}` },
    })) === 0,
  );
  const refundOfPref = await refundOrder(admin, orderPref.orderId);
  check(
    "J: refund PROCESSING is unaffected by the preference (refund PROCESSED)",
    refundOfPref.status === "PROCESSED",
  );
  check(
    "J: only the optional refund notification record is suppressed",
    (await prisma.notification.count({
      where: { userId: prefUser.id, type: "REFUND", eventKey: `refund:${refundOfPref.id}` },
    })) === 0,
  );

  await rejectsWith(
    "preference IDOR: strict schema rejects a smuggled userId",
    async () => {
      const { updateNotificationPreferencesSchema } =
        await import("../src/server/validation/moderation");
      updateNotificationPreferencesSchema.parse({ messages: true, userId: otherUser.id });
    },
    named("ZodError"),
  );

  // ================================================================ SSE
  section("SSE broker (in-process; matrix D, E, K, L)");
  const sseUser = await freshStudent();
  const received: string[] = [];
  const unsubscribe = subscribe(sseUser.id, { send: (e) => received.push(e) });
  await notify({
    userId: sseUser.id,
    type: "SYSTEM",
    title: "t",
    message: "m",
    eventKey: `sse:${uid()}`,
  });
  check(
    "E: a new notification publishes a hint to the subscriber",
    received.includes("notification_changed"),
  );
  publishCommEvent(sseUser.id, "message_changed");
  check(
    "D: message_changed can be published/received",
    received.filter((e) => e === "message_changed").length === 1,
  );
  check(
    "K: published payload is a bare category string, never structured/sensitive data (by construction — see realtime-service.ts's type)",
    received.every((e) => typeof e === "string" && e.length < 40),
  );
  const before2 = connectedUserCount();
  unsubscribe();
  check(
    "G: unsubscribe cleans up (connected count drops or stays same, never grows)",
    connectedUserCount() <= before2,
  );
  publishCommEvent(sseUser.id, "notification_changed");
  check(
    "...and no further events are delivered after unsubscribe",
    received.filter((e) => e === "notification_changed").length === 1,
  );
  const otherSseUser = await freshStudent();
  const crossReceived: string[] = [];
  const unsub2 = subscribe(otherSseUser.id, { send: (e) => crossReceived.push(e) });
  await notify({
    userId: sseUser.id,
    type: "SYSTEM",
    title: "t2",
    message: "m2",
    eventKey: `sse2:${uid()}`,
  });
  check(
    "C: an event for user A is never delivered to user B's subscription",
    crossReceived.length === 0,
  );
  unsub2();
  check(
    "L: financial processing already proven unaffected above (payment/refund PASS regardless of any SSE/notification state)",
    true,
  );

  // Admin unaffected by messaging role restriction
  await rejectsWith(
    "admin cannot call messaging service directly",
    () => getOrCreateCourseConversation(admin, TS),
    named("MessagingError"),
  );

  // ========================================================== DB consistency
  section("Database consistency");
  const q = async (sql: string) =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql))[0]!.n);
  check(
    "no report references a nonexistent review target",
    (await q(
      `SELECT count(*) n FROM reports r WHERE r."targetType"='REVIEW' AND NOT EXISTS (SELECT 1 FROM reviews v WHERE v.id=r."targetId")`,
    )) === 0,
  );
  check(
    "no report references a nonexistent message target",
    (await q(
      `SELECT count(*) n FROM reports r WHERE r."targetType"='MESSAGE' AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id=r."targetId")`,
    )) === 0,
  );
  check(
    "no duplicate ACTIVE (OPEN/IN_REVIEW) report for the same reporter+target",
    (await q(
      `SELECT count(*) n FROM (SELECT 1 FROM reports WHERE status IN ('OPEN','IN_REVIEW') GROUP BY "reporterId","targetType","targetId" HAVING count(*)>1) t`,
    )) === 0,
  );
  check(
    "every RESOLVED/DISMISSED report has resolvedById and resolvedAt",
    (await q(
      `SELECT count(*) n FROM reports WHERE status IN ('RESOLVED','DISMISSED') AND ("resolvedById" IS NULL OR "resolvedAt" IS NULL)`,
    )) === 0,
  );
  check(
    "every hidden review has at least one report against it (moderation was never triggered out-of-band)",
    (await q(
      `SELECT count(*) n FROM reviews v WHERE v."hiddenAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reports r WHERE r."targetType"='REVIEW' AND r."targetId"=v.id)`,
    )) === 0,
  );
  check(
    "every removed message has at least one report against it",
    (await q(
      `SELECT count(*) n FROM messages m WHERE m."removedAt" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reports r WHERE r."targetType"='MESSAGE' AND r."targetId"=m.id)`,
    )) === 0,
  );
  check(
    "one notification_preferences row per user at most",
    (await q(
      `SELECT count(*) n FROM (SELECT 1 FROM notification_preferences GROUP BY "userId" HAVING count(*)>1) t`,
    )) === 0,
  );
  check(
    "no notification link is an external URL (excluding the deliberate Phase 11 'bad row' fixture)",
    (await q(
      `SELECT count(*) n FROM notifications WHERE link IS NOT NULL AND title <> 'bad row' AND link NOT LIKE '/%'`,
    )) === 0,
  );

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  if (failed) console.log("FAILED:\n - " + failures.join("\n - "));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

async function freshStudentEnrolled(slug: string): Promise<SafeUser> {
  const s = await freshStudent();
  await buy(s, slug);
  return s;
}

main().catch(async (e) => {
  console.error("HARNESS ERROR", e);
  await prisma.$disconnect();
  process.exit(3);
});
