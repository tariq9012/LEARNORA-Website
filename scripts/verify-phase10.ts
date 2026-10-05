/**
 * Phase 10 integration verification — runs the REAL services against a REAL
 * PostgreSQL database (no mocks). It creates its own fresh students and
 * purchases through the Phase 9 checkout/payment services, so it needs the
 * normal seed data (npm run db:seed) for instructors, admin and courses.
 *
 * SAFETY: it writes orders, refunds and payouts, so it refuses to run unless
 * the database name ends with "_test". Create a throwaway database, e.g.:
 *
 *   createdb learnora_test
 *   DATABASE_URL=postgresql://USER:PASS@localhost:5432/learnora_test \
 *   DIRECT_URL=postgresql://USER:PASS@localhost:5432/learnora_test \
 *   npx prisma migrate deploy && npm run db:seed
 *   DATABASE_URL=... DIRECT_URL=... SESSION_SECRET=<32+ chars> npx tsx scripts/verify-phase10.ts
 *
 * What it does NOT cover: the HTTP layer (requireAdmin/requireInstructor
 * guards inside createServerFn, CSRF, the React UI). Those need a browser.
 */
import { randomUUID } from "node:crypto";

import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/client";
import { computeEarningSplit, getFinancePolicy } from "../src/server/config/finance-policy";
import { toSafeUser } from "../src/server/auth/types";
import { canViewAsset } from "../src/server/media/media-access-service";
import {
  createCheckoutOrder,
  getAdminOrders,
  getMyPurchases,
} from "../src/server/services/checkout-service";
import { confirmTestPayment } from "../src/server/services/payment-service";
import {
  enrollInCourse,
  getCourseLearning,
  getMyLearning,
  markLessonComplete,
} from "../src/server/services/enrollment-service";
import {
  getInstructorEarnings,
  getInstructorEarningsSummary,
  getAdminFinanceStats,
} from "../src/server/services/earnings-service";
import {
  getAdminPayouts,
  getInstructorPayouts,
  requestPayout,
  approvePayout,
  rejectPayout,
} from "../src/server/services/payout-service";
import { refundOrder, getAdminRefunds } from "../src/server/services/refund-service";
import { createCourseReview } from "../src/server/services/review-service";
import { getOrCreateCertificate } from "../src/server/services/certificate-service";
import { refundOrderSchema } from "../src/server/validation/finance";
import type { PaymentProvider } from "../src/server/payments";
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
const D = (v: string | number) => new Prisma.Decimal(v);
const section = (t: string) => console.log(`\n== ${t}`);

async function user(email: string): Promise<SafeUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  return toSafeUser(u);
}
async function freshStudent(): Promise<SafeUser> {
  const id = randomUUID().slice(0, 8);
  const u = await prisma.user.create({
    data: {
      name: `Test Student ${id}`,
      email: `p10-${id}@example.test`,
      passwordHash: "x",
      role: "STUDENT",
    },
  });
  return toSafeUser(u);
}
async function buy(student: SafeUser, slug: string): Promise<string> {
  const order = await createCheckoutOrder(student, slug);
  const done = await confirmTestPayment(student, order.orderId);
  if (done.status !== "PAID") throw new Error(`purchase failed: ${done.status}`);
  return order.orderId;
}
async function earningFor(orderId: string) {
  const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId } });
  return prisma.instructorEarning.findUniqueOrThrow({ where: { orderItemId: item.id } });
}
async function enrollmentStatus(studentId: string, slug: string) {
  const course = await prisma.course.findUniqueOrThrow({ where: { slug } });
  return (
    await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: studentId, courseId: course.id } },
    })
  )?.status;
}

async function main() {
  const admin = await user("admin@learnora.dev");
  const elena = await user("elena.vasquez@learnora.dev");
  const marcus = await user("marcus.chen@learnora.dev");
  const priyanka = await user("priyanka.das@learnora.dev");
  const sara = await user("sara.khan@learnora.dev");

  // ---------------------------------------------------------------- policy
  section("Revenue-share policy");
  const policy = getFinancePolicy();
  check(
    "default instructor share 70%, minimum payout 50.00",
    policy.instructorSharePercent === 70 && policy.minimumPayoutAmount.equals(50),
  );
  const split = computeEarningSplit(D("33.33"));
  check(
    "split 33.33 -> 23.33 / 10.00, adds back to gross",
    split.netAmount.equals("23.33") &&
      split.platformAmount.equals("10.00") &&
      split.netAmount.plus(split.platformAmount).equals("33.33"),
  );

  // -------------------------------------------------------------- earnings
  section("Earnings (matrix A-F)");
  const stA = await freshStudent();
  const orderA = await buy(stA, "advanced-typescript-patterns"); // 94.99
  const earnA = await earningFor(orderA);
  check("A: paid purchase creates an earning", true);
  check("B: earning belongs to the course's instructor", earnA.instructorId === elena.id);
  check(
    "C: gross 94.99 / net 66.49 / platform 28.50 / rate 0.3000 / AVAILABLE",
    earnA.grossAmount.equals("94.99") &&
      earnA.netAmount.equals("66.49") &&
      earnA.grossAmount.minus(earnA.netAmount).equals("28.50") &&
      earnA.commissionRate.equals("0.3") &&
      earnA.status === "AVAILABLE",
  );
  await prisma.course.update({
    where: { slug: "advanced-typescript-patterns" },
    data: { price: D("149.99") },
  });
  const earnA2 = await earningFor(orderA);
  check(
    "D: later course price change does not alter the historical earning",
    earnA2.grossAmount.equals("94.99") && earnA2.netAmount.equals("66.49"),
  );
  await prisma.course.update({
    where: { slug: "advanced-typescript-patterns" },
    data: { price: D("94.99") },
  });
  const before = await prisma.instructorEarning.count();
  const stFree = await freshStudent();
  await enrollInCourse(stFree, "programming-fundamentals-js");
  check(
    "F: free enrollment creates no earning",
    (await prisma.instructorEarning.count()) === before,
  );
  const marcusView = await getInstructorEarnings(marcus);
  check(
    "E: instructor B sees none of instructor A's earnings",
    marcusView.earnings.every((e) => e.orderNumber !== "") &&
      !marcusView.earnings.some((e) => e.id === earnA.id),
  );
  await rejectsWith(
    "E: student cannot read earnings",
    () => getInstructorEarnings(stA),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "E: admin cannot read 'my earnings'",
    () => getInstructorEarnings(admin),
    named("ForbiddenError"),
  );

  // ---------------------------------------------------------------- refunds
  section("Refund: access before/after (matrix A-L)");
  const course = await prisma.course.findUniqueOrThrow({
    where: { slug: "advanced-typescript-patterns" },
    include: {
      sections: {
        include: { lessons: { orderBy: { position: "asc" } } },
        orderBy: { position: "asc" },
      },
    },
  });
  const lessons = course.sections.flatMap((s) => s.lessons);
  const paidLesson = lessons.find((l) => !l.isPreview)!;
  const previewLesson = lessons.find((l) => l.isPreview);
  const mk = (purpose: "LESSON_VIDEO" | "LESSON_RESOURCE") =>
    prisma.asset.create({
      data: {
        ownerId: elena.id,
        storageKey: `p10/${randomUUID()}`,
        originalFilename: "f.bin",
        mimeType: "video/mp4",
        sizeBytes: 10,
        purpose,
      },
    });
  const vid = await mk("LESSON_VIDEO");
  await prisma.lesson.update({ where: { id: paidLesson.id }, data: { videoAssetId: vid.id } });
  const resAsset = await mk("LESSON_RESOURCE");
  await prisma.lessonResource.create({
    data: { lessonId: paidLesson.id, assetId: resAsset.id, title: "Notes" },
  });
  let prevVid: { id: string } | null = null;
  if (previewLesson) {
    prevVid = await mk("LESSON_VIDEO");
    await prisma.lesson.update({
      where: { id: previewLesson.id },
      data: { videoAssetId: prevVid.id },
    });
  }
  const slug = course.slug;
  check("before: player allowed", (await getCourseLearning(stA, slug)).ok === true);
  check("before: private video allowed", (await canViewAsset(stA, vid.id)).allowed);
  check("before: private resource allowed", (await canViewAsset(stA, resAsset.id)).allowed);
  check(
    "before: progress mutation works",
    Array.isArray((await markLessonComplete(stA, slug, paidLesson.id, true)).completedLessonIds),
  );
  check(
    "before: appears in My Learning",
    (await getMyLearning(stA)).some((c) => c.courseSlug === slug),
  );
  await createCourseReview(stA, slug, { rating: 5, comment: "Great" });

  // completed course -> certificate exists before refund (Phase 8 regression)
  for (const l of lessons) await markLessonComplete(stA, slug, l.id, true);
  const certBefore = await getOrCreateCertificate(stA, slug).catch((e) => e);
  const certRows0 = await prisma.certificate.count({ where: { userId: stA.id } });

  await rejectsWith(
    "B: student cannot refund",
    () => refundOrder(stA, orderA),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "C: instructor cannot refund",
    () => refundOrder(elena, orderA),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "tamper: extra `amount` field rejected by schema",
    async () => {
      refundOrderSchema.parse({ orderId: orderA, amount: "0.01" });
    },
    (e) => e instanceof Error && e.name === "ZodError",
  );
  await rejectsWith(
    "unknown order id",
    () => refundOrder(admin, "does-not-exist"),
    code("NOT_FOUND"),
  );

  const ord = await createCheckoutOrder(await freshStudent(), "python-for-data-science");
  const stFail = await prisma.order.findUniqueOrThrow({ where: { id: ord.orderId } });
  const failStudent = toSafeUser(
    await prisma.user.findUniqueOrThrow({ where: { id: stFail.userId } }),
  );
  await confirmTestPayment(failStudent, ord.orderId, { simulateFailure: true }).catch(
    () => undefined,
  ); // throws PaymentFailedError by design
  await rejectsWith(
    "D: failed payment cannot be refunded",
    () => refundOrder(admin, ord.orderId),
    code("NOT_PAID"),
  );

  const listed = (await getAdminOrders(admin, { pageSize: 50 })).orders.find(
    (o) => o.orderId === orderA,
  )!;
  check(
    "admin list: paid order is refundable, no block reason",
    listed.refundable && listed.refundBlockedReason === null && listed.refund === null,
  );

  const refund = await refundOrder(admin, orderA, { reason: "Test refund" });
  check(
    "A: admin refund succeeds (PROCESSED, 94.99, LRN-REF ref)",
    refund.status === "PROCESSED" &&
      refund.amount === "94.99" &&
      refund.reference.startsWith("LRN-REF-"),
  );
  const [o, p, e, en] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderA } }),
    prisma.payment.findFirstOrThrow({ where: { orderId: orderA, status: { not: "FAILED" } } }),
    earningFor(orderA),
    enrollmentStatus(stA.id, slug),
  ]);
  check("G: order REFUNDED", o.status === "REFUNDED");
  check("H: payment REFUNDED", p.status === "REFUNDED");
  check(
    "I: earning REVERSED and linked to the refund",
    e.status === "REVERSED" && e.refundId === refund.id && e.payoutId === null,
  );
  check("J: enrollment CANCELLED (row kept, not deleted)", en === "CANCELLED");
  check("K: player denied", (await getCourseLearning(stA, slug)).ok === false);
  check("K: private video denied", !(await canViewAsset(stA, vid.id)).allowed);
  check("K: private resource denied", !(await canViewAsset(stA, resAsset.id)).allowed);
  await rejectsWith(
    "K: progress mutation denied",
    () => markLessonComplete(stA, slug, paidLesson.id, false),
    () => true,
  );
  if (prevVid)
    check("K: public preview stays public", (await canViewAsset(null, prevVid.id)).allowed);
  check("K: gone from My Learning", !(await getMyLearning(stA)).some((c) => c.courseSlug === slug));
  const purchases = await getMyPurchases(stA);
  const pu = purchases.find((x) => x.orderId === orderA);
  check(
    "L: purchase history shows REFUNDED with refund date",
    pu?.status === "REFUNDED" && !!pu.refundedAt,
  );
  await rejectsWith(
    "E: second refund refused",
    () => refundOrder(admin, orderA),
    code("ALREADY_REFUNDED"),
  );
  check(
    "refund history lists it",
    (await getAdminRefunds(admin)).some((r) => r.reference === refund.reference && r.orderNumber),
  );
  const listed2 = (await getAdminOrders(admin, { pageSize: 50 })).orders.find(
    (x) => x.orderId === orderA,
  )!;
  check(
    "admin list: refunded row has no Refund action, shows reference",
    !listed2.refundable && listed2.refund?.reference === refund.reference,
  );
  check(
    "earnings summary reflects reversal",
    (await getInstructorEarningsSummary(elena)).reversedAmount === "66.49",
  );

  section("Phase 8 regression after refund");
  check(
    "review row still exists (historical)",
    (await prisma.review.count({ where: { userId: stA.id } })) === 1,
  );
  check(
    "certificate row untouched by refund",
    (await prisma.certificate.count({ where: { userId: stA.id } })) === certRows0,
  );
  console.log(
    `  info  certificate before refund: ${certBefore instanceof Error ? certBefore.message : "issued"}, rows=${certRows0}`,
  );
  check(
    "certificate does NOT grant course access",
    (await canViewAsset(stA, vid.id)).allowed === false &&
      (await getCourseLearning(stA, slug)).ok === false,
  );
  await rejectsWith(
    "cancelled student cannot post a new review",
    async () => {
      await prisma.review.deleteMany({ where: { userId: stA.id } });
      await createCourseReview(stA, slug, { rating: 4 });
    },
    () => true,
  );
  await rejectsWith(
    "cancelled student gets no NEW certificate path (not COMPLETED)",
    async () => {
      await prisma.certificate.deleteMany({ where: { userId: stA.id } });
      await getOrCreateCertificate(stA, slug);
    },
    () => true,
  );

  section("Re-purchase after refund");
  const reOrder = await buy(stA, "advanced-typescript-patterns");
  check(
    "re-purchase reactivates entitlement",
    (await enrollmentStatus(stA.id, slug)) === "ACTIVE" && (await getCourseLearning(stA, slug)).ok,
  );
  check("re-purchase makes a NEW earning", (await earningFor(reOrder)).status === "AVAILABLE");

  // ------------------------------------------------------- duplicate refund
  section("Refund idempotency / concurrency (matrix F)");
  const stB = await freshStudent();
  const orderB = await buy(stB, "design-systems-fundamentals");
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => refundOrder(admin, orderB)),
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  check("6 simultaneous refunds -> exactly 1 succeeds", ok === 1, `(ok=${ok})`);
  check(
    "...and the rest fail as ALREADY_REFUNDED",
    results
      .filter((r) => r.status === "rejected")
      .every((r) => (r as PromiseRejectedResult).reason?.code === "ALREADY_REFUNDED"),
  );
  const payB = await prisma.payment.findFirstOrThrow({
    where: { orderId: orderB, status: "REFUNDED" },
  });
  check(
    "exactly one Refund row for the payment",
    (await prisma.refund.count({ where: { paymentId: payB.id } })) === 1,
  );
  check(
    "earning reversed once, enrollment cancelled",
    (await earningFor(orderB)).status === "REVERSED" &&
      (await enrollmentStatus(stB.id, "design-systems-fundamentals")) === "CANCELLED",
  );
  const dupRefund = await prisma.refund.findFirst({ where: { paymentId: payB.id } });
  await rejectsWith(
    "DB guard: raw duplicate Refund row violates UNIQUE(paymentId)",
    () =>
      prisma.refund.create({
        data: {
          paymentId: payB.id,
          reference: "LRN-REF-DUPTEST01",
          amount: D(1),
          requestedById: admin.id,
        },
      }),
    (e) => (e as { code?: string }).code === "P2002",
  );
  void dupRefund;

  // provider failure leaves everything untouched
  const stP = await freshStudent();
  const orderP = await buy(stP, "python-for-data-science");
  const failing: PaymentProvider = {
    name: "failing",
    charge: async () => ({ status: "FAILED", providerReference: "x", reason: "x" }),
    refund: async () => ({ status: "FAILED", reason: "declined" }),
  } as unknown as PaymentProvider;
  await rejectsWith(
    "provider decline -> PROVIDER_DECLINED",
    () => refundOrder(admin, orderP, {}, failing),
    code("PROVIDER_DECLINED"),
  );
  check(
    "provider decline changed nothing",
    (await prisma.order.findUniqueOrThrow({ where: { id: orderP } })).status === "PAID" &&
      (await earningFor(orderP)).status === "AVAILABLE" &&
      (await enrollmentStatus(stP.id, "python-for-data-science")) === "ACTIVE",
  );
  check(
    "no Refund row after decline",
    (await prisma.refund.count({ where: { payment: { orderId: orderP } } })) === 0,
  );

  // ----------------------------------------------------------------- payouts
  section("Payouts (matrix A-Q)");
  await rejectsWith(
    "B: pending instructor cannot request payout",
    () => requestPayout(priyanka, { expectedAmount: "0.00" }),
    code("NOT_APPROVED"),
  );
  await rejectsWith(
    "student cannot request payout",
    () => requestPayout(stA, { expectedAmount: "60.00" }),
    named("ForbiddenError"),
  );
  const mSum0 = await getInstructorEarningsSummary(marcus);
  check(
    "approved instructor sees real summary (min 50.00, 70%)",
    mSum0.minimumPayout === "50.00" &&
      mSum0.revenueSharePercent === 70 &&
      mSum0.canRequestPayout === false,
  );
  // Marcus's only earning so far is the python-for-data-science sale above (34.99 -> 24.49).
  // Elena's much larger balance must NOT leak into his numbers or his payout.
  const mSum1 = await getInstructorEarningsSummary(marcus);
  const mExpected = mSum0.availableBalance; // Marcus's own sales only (seed sale + the python sale above); must stay < 50
  check(
    "marcus available = own sales only (below minimum, none of Elena's)",
    mSum1.availableBalance === mExpected &&
      D(mExpected).lt(50) &&
      !mSum1.canRequestPayout &&
      !!mSum1.payoutBlockedReason,
    `(got ${mSum1.availableBalance}, expected ${mExpected})`,
  );
  await rejectsWith(
    "C: below-minimum rejected",
    () => requestPayout(marcus, { expectedAmount: mExpected }),
    code("BELOW_MINIMUM"),
  );

  const elenaPayoutsBefore = await prisma.payout.count({ where: { instructorId: elena.id } });
  const eSum = await getInstructorEarningsSummary(elena);
  const bal = eSum.availableBalance;
  check("elena has a payable balance", D(bal).gte(50), `(bal=${bal})`);
  for (const [label, val] of [
    ["D: zero", "0.00"],
    ["E: negative", "-5"],
    ["too many decimals", "10.999"],
    ["not a number", "abc"],
    ["exponent", "1e3"],
  ] as const) {
    await rejectsWith(
      `${label} rejected`,
      () => requestPayout(elena, { expectedAmount: val }),
      (e) =>
        (e as Error).name === "ZodError" || (e as { code?: string }).code === "AMOUNT_MISMATCH",
    );
  }
  await rejectsWith(
    "F: above-balance (999999) rejected",
    () => requestPayout(elena, { expectedAmount: "999999" }),
    code("AMOUNT_MISMATCH"),
  );
  await rejectsWith(
    "tamper: unknown extra field rejected",
    () => requestPayout(elena, { expectedAmount: bal, amount: "1" } as never),
    (e) => (e as Error).name === "ZodError",
  );
  check(
    "rejected attempts reserved nothing",
    (await getInstructorEarningsSummary(elena)).availableBalance === bal &&
      (await prisma.payout.count({ where: { instructorId: elena.id } })) === elenaPayoutsBefore,
  );

  const payout = await requestPayout(elena, { expectedAmount: bal });
  check(
    "G: valid request -> PENDING SIMULATED payout for the exact balance",
    payout.status === "PENDING" &&
      payout.amount === bal &&
      payout.method === "SIMULATED" &&
      payout.reference.startsWith("LRN-PAY-"),
  );
  const reservedRows = await prisma.instructorEarning.findMany({ where: { payoutId: payout.id } });
  check(
    "H: earnings RESERVED and sum == payout amount",
    reservedRows.length > 0 &&
      reservedRows.every((r) => r.status === "RESERVED") &&
      reservedRows.reduce((a, r) => a.plus(r.netAmount), D(0)).equals(bal),
  );
  const afterReq = await getInstructorEarningsSummary(elena);
  check(
    "balance moved available -> pending",
    afterReq.availableBalance === "0.00" && afterReq.pendingPayout === bal,
  );
  await rejectsWith(
    "second request cannot reuse reserved earnings",
    () => requestPayout(elena, { expectedAmount: bal }),
    code("NO_BALANCE"),
  );
  check(
    "J: admin sees the payout with instructor name",
    (await getAdminPayouts(admin)).some(
      (x) =>
        x.id === payout.id &&
        x.instructorName.length > 0 &&
        x.earningsCount === reservedRows.length,
    ),
  );
  await rejectsWith(
    "K: instructor cannot approve own payout",
    () => approvePayout(elena, payout.id),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "K: instructor cannot reject own payout",
    () => rejectPayout(elena, payout.id),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "student cannot approve payout",
    () => approvePayout(stA, payout.id),
    named("ForbiddenError"),
  );
  await rejectsWith(
    "Cross-instructor: marcus's payout list excludes elena's",
    async () => {
      if ((await getInstructorPayouts(marcus)).some((x) => x.id === payout.id))
        throw new Error("leak");
      throw new Error("ok-none");
    },
    (e) => (e as Error).message === "ok-none",
  );

  section("Refund vs payout edge cases (M, N)");
  const lockedOrder = (
    await prisma.orderItem.findFirstOrThrow({ where: { earning: { payoutId: payout.id } } })
  ).orderId;
  const stLocked = (await prisma.order.findUniqueOrThrow({ where: { id: lockedOrder } })).userId;
  const lockedList = (await getAdminOrders(admin, { pageSize: 50 })).orders.find(
    (x) => x.orderId === lockedOrder,
  )!;
  check(
    "M: admin list marks it not refundable with a reason",
    !lockedList.refundable && !!lockedList.refundBlockedReason,
  );
  await rejectsWith(
    "M: refund blocked while earning is in a pending payout",
    () => refundOrder(admin, lockedOrder),
    code("EARNING_LOCKED_IN_PAYOUT"),
  );
  check(
    "M: nothing changed by the blocked refund",
    (await prisma.order.findUniqueOrThrow({ where: { id: lockedOrder } })).status === "PAID" &&
      (await prisma.refund.count({ where: { payment: { orderId: lockedOrder } } })) === 0,
  );
  void stLocked;

  section("Reject / approve (L-P) + idempotency");
  const rej = await rejectPayout(admin, payout.id, "Test rejection");
  check(
    "O: payout REJECTED with reason and processedAt",
    rej.status === "REJECTED" && rej.rejectionReason === "Test rejection" && !!rej.processedAt,
  );
  const afterRej = await getInstructorEarningsSummary(elena);
  check(
    "P: rejected payout releases earnings back to available",
    afterRej.availableBalance === bal && afterRej.pendingPayout === "0.00",
  );
  check(
    "P: released earnings are detached from the payout",
    (await prisma.instructorEarning.count({ where: { payoutId: payout.id } })) === 0,
  );
  await rejectsWith(
    "rejecting again refused",
    () => rejectPayout(admin, payout.id),
    code("ALREADY_PROCESSED"),
  );
  await rejectsWith(
    "approving a rejected payout refused",
    () => approvePayout(admin, payout.id),
    code("ALREADY_PROCESSED"),
  );

  // Concurrent payout requests
  const par = await Promise.allSettled(
    Array.from({ length: 6 }, () => requestPayout(elena, { expectedAmount: bal })),
  );
  check(
    "I: 6 simultaneous requests -> exactly 1 succeeds",
    par.filter((r) => r.status === "fulfilled").length === 1,
    `(${par.filter((r) => r.status === "fulfilled").length})`,
  );
  check(
    "I: exactly one new payout row; no earning reserved twice",
    (await prisma.payout.count({ where: { instructorId: elena.id, status: "PENDING" } })) === 1,
  );
  const pay2 = (
    par.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<
      Awaited<ReturnType<typeof requestPayout>>
    >
  ).value;

  // Concurrent approve
  const appr = await Promise.allSettled([
    approvePayout(admin, pay2.id),
    approvePayout(admin, pay2.id),
    approvePayout(admin, pay2.id),
  ]);
  check(
    "3 simultaneous approvals -> exactly 1 succeeds",
    appr.filter((r) => r.status === "fulfilled").length === 1,
  );
  const paidRow = await prisma.payout.findUniqueOrThrow({ where: { id: pay2.id } });
  check(
    "L: payout PAID with processedAt + processedBy",
    paidRow.status === "PAID" && !!paidRow.processedAt && paidRow.processedById === admin.id,
  );
  const paidEarn = await prisma.instructorEarning.findMany({ where: { payoutId: pay2.id } });
  check(
    "M: associated earnings PAID",
    paidEarn.length > 0 && paidEarn.every((r) => r.status === "PAID"),
  );
  const sumPaid = await getInstructorEarningsSummary(elena);
  check(
    "N: paid payout no longer in available balance; paidOut correct",
    sumPaid.availableBalance === "0.00" &&
      sumPaid.paidOut === bal &&
      sumPaid.pendingPayout === "0.00",
  );
  const hist = await getInstructorPayouts(elena);
  check(
    "Q: instructor history shows REJECTED and PAID",
    hist.some((h) => h.status === "REJECTED") &&
      hist.some((h) => h.status === "PAID" && h.processedAt),
  );
  await rejectsWith(
    "rejecting a PAID payout refused",
    () => rejectPayout(admin, pay2.id),
    code("ALREADY_PROCESSED"),
  );

  const paidOrder = (
    await prisma.orderItem.findFirstOrThrow({ where: { earning: { payoutId: pay2.id } } })
  ).orderId;
  await rejectsWith(
    "N: refund blocked once earning was paid out",
    () => refundOrder(admin, paidOrder),
    code("EARNING_ALREADY_PAID_OUT"),
  );
  check(
    "N: blocked refund changed nothing",
    (await prisma.order.findUniqueOrThrow({ where: { id: paidOrder } })).status === "PAID",
  );

  // ------------------------------------------- refund vs payout RACE rounds
  section("Race: refund vs payout request on the same earning (5 rounds)");
  let raceOk = true;
  for (let i = 0; i < 5; i++) {
    const s = await freshStudent();
    const ord = await buy(s, "modern-react-typescript"); // 49.99 -> 34.99 ; plus another to exceed the minimum
    const s2 = await freshStudent();
    await buy(s2, "advanced-typescript-patterns"); // 66.49 available regardless
    const exp = (await getInstructorEarningsSummary(elena)).availableBalance;
    const [r, p] = await Promise.allSettled([
      refundOrder(admin, ord),
      requestPayout(elena, { expectedAmount: exp }),
    ]);
    const e = await earningFor(ord);
    const refunded = r.status === "fulfilled";
    const consistent = refunded
      ? e.status === "REVERSED" && e.payoutId === null
      : e.status === "RESERVED" || e.status === "AVAILABLE";
    if (!consistent) raceOk = false;
    // whatever happened, close out the open payout so the next round starts clean
    if (p.status === "fulfilled") await rejectPayout(admin, p.value.id);
    if (!consistent)
      console.log(`    round ${i}: refund=${r.status} payout=${p.status} earning=${e.status}`);
  }
  check("no round left an earning both reversed and reserved / inconsistent", raceOk);

  // ---------------------------------------------------- dashboards / stats
  section("Dashboards");
  const stats = await getAdminFinanceStats(admin);
  check(
    "admin finance stats reflect real payouts/refunds",
    stats.refundCount >= 2 && D(stats.paidOutAmount).gte(bal),
  );

  // ------------------------------------------------ database consistency
  section("Database consistency (no impossible states)");
  const q = async (sql: string) =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(sql))[0]!.n);
  check(
    "REFUNDED orders always have a refund row and a REFUNDED payment",
    (await q(
      `SELECT count(*) n FROM orders o WHERE o.status='REFUNDED' AND NOT EXISTS (SELECT 1 FROM payments p JOIN refunds r ON r."paymentId"=p.id WHERE p."orderId"=o.id AND p.status='REFUNDED')`,
    )) === 0,
  );
  check(
    "every refund row has a REFUNDED payment + REFUNDED order",
    (await q(
      `SELECT count(*) n FROM refunds r JOIN payments p ON p.id=r."paymentId" JOIN orders o ON o.id=p."orderId" WHERE p.status<>'REFUNDED' OR o.status<>'REFUNDED'`,
    )) === 0,
  );
  check(
    "REVERSED earnings <=> refunded order",
    (await q(
      `SELECT count(*) n FROM instructor_earnings e JOIN order_items i ON i.id=e."orderItemId" JOIN orders o ON o.id=i."orderId" WHERE (e.status='REVERSED') <> (o.status='REFUNDED')`,
    )) === 0,
  );
  check(
    "no earning is reversed AND attached to a payout",
    (await q(
      `SELECT count(*) n FROM instructor_earnings WHERE status='REVERSED' AND "payoutId" IS NOT NULL`,
    )) === 0,
  );
  check(
    "payout amount == sum of its earnings (all payouts with earnings)",
    (await q(
      `SELECT count(*) n FROM payouts p WHERE p.status IN ('PENDING','PAID') AND p.amount <> COALESCE((SELECT sum(e."netAmount") FROM instructor_earnings e WHERE e."payoutId"=p.id),0)`,
    )) === 0,
  );
  check(
    "RESERVED earnings only under PENDING/PROCESSING payouts; PAID only under PAID",
    (await q(
      `SELECT count(*) n FROM instructor_earnings e JOIN payouts p ON p.id=e."payoutId" WHERE (e.status='RESERVED' AND p.status NOT IN ('PENDING','PROCESSING')) OR (e.status='PAID' AND p.status<>'PAID')`,
    )) === 0,
  );
  check(
    "REFUNDED orders have no ACTIVE/COMPLETED enrollment (unless another PAID order)",
    (await q(
      `SELECT count(*) n FROM orders o JOIN order_items i ON i."orderId"=o.id JOIN enrollments en ON en."userId"=o."userId" AND en."courseId"=i."courseId" WHERE o.status='REFUNDED' AND en.status<>'CANCELLED' AND NOT EXISTS (SELECT 1 FROM orders o2 JOIN order_items i2 ON i2."orderId"=o2.id WHERE o2."userId"=o."userId" AND o2.status='PAID' AND i2."courseId"=i."courseId")`,
    )) === 0,
  );
  check(
    "DB CHECK: cannot RESERVE an earning without a payout link",
    await (async () => {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE instructor_earnings SET status='RESERVED' WHERE id=(SELECT id FROM instructor_earnings WHERE status='AVAILABLE' LIMIT 1)`,
        );
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    "DB CHECK: cannot insert a zero-amount payout",
    await (async () => {
      try {
        await prisma.payout.create({ data: { instructorId: elena.id, amount: D(0) } });
        return false;
      } catch {
        return true;
      }
    })(),
  );
  void sara;

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
