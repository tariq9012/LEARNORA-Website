/**
 * Phase 15 integration verification — real services, real PostgreSQL.
 * Refuses to run unless the database name ends in "_test"; needs the normal
 * seed (npm run db:seed) on a FRESH test database. It creates its own users
 * and orders (prefix "p15-") and never touches anything else.
 *
 *   DATABASE_URL=postgresql://USER:PASS@localhost:5432/learnora_test \
 *   DIRECT_URL=... SESSION_SECRET=<32+ chars> npm run verify:phase15
 *
 * Run each verify suite on a FRESH seeded _test database (they share global
 * aggregates such as earnings totals, so a previous suite's data can skew the next).
 *
 * Not covered (needs a browser / HTTP layer): createServerFn HTTP guards,
 * CSRF on raw routes, the React UI, cookie flags.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "../src/server/db/client";
import { toSafeUser } from "../src/server/auth/types";
import { createCheckoutOrder, getAdminOrders } from "../src/server/services/checkout-service";
import { confirmTestPayment } from "../src/server/services/payment-service";
import { refundOrder } from "../src/server/services/refund-service";
import {
  createCourseReview,
  getReviewsForCourse,
  updateCourseReview,
  ReviewNotFoundError,
} from "../src/server/services/review-service";
import { reportReview } from "../src/server/services/report-service";
import { resolveReport } from "../src/server/services/moderation-service";
import {
  UserAdminError,
  listAdminStudents,
  listAdminUsers,
  setUserStatus,
} from "../src/server/services/admin-user-service";
import { listInstructorStudents } from "../src/server/services/enrollment-listing-service";
import { getPlatformStats } from "../src/server/services/platform-stats-service";
import { formatPrice } from "../src/lib/format";
import { sanitizeInternalPath } from "../src/lib/safe-path";
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
async function rejects(name: string, fn: () => Promise<unknown>, match?: (e: unknown) => boolean) {
  try {
    await fn();
    check(name, false, "(did not throw)");
  } catch (e) {
    check(name, match ? match(e) : true, `(threw ${e instanceof Error ? e.name : String(e)})`);
  }
}
const named = (n: string) => (e: unknown) => e instanceof Error && e.name === n;
const section = (t: string) => console.log(`\n== ${t}`);

async function byEmail(email: string): Promise<SafeUser> {
  return toSafeUser(await prisma.user.findUniqueOrThrow({ where: { email } }));
}
async function freshStudent(tag: string): Promise<SafeUser> {
  const id = randomUUID().slice(0, 8);
  return toSafeUser(
    await prisma.user.create({
      data: {
        name: `P15 ${tag} ${id}`,
        email: `p15-${id}@example.test`,
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
  const admin = await byEmail("admin@learnora.dev");
  const elena = await byEmail("elena.vasquez@learnora.dev");
  const marcus = await byEmail("marcus.chen@learnora.dev");
  const paid = await prisma.course.findFirstOrThrow({
    where: { status: "PUBLISHED", price: { gt: 0 } },
    select: { slug: true, instructorId: true },
  });

  // ------------------------------------------------------------- RBAC
  section("Admin users / students RBAC");
  const student = await freshStudent("RBAC");
  for (const [label, who] of [
    ["student", student],
    ["instructor", elena],
  ] as const) {
    await rejects(
      `${label} cannot list admin users`,
      () => listAdminUsers(who, {}),
      named("ForbiddenError"),
    );
    await rejects(
      `${label} cannot list admin students`,
      () => listAdminStudents(who, {}),
      named("ForbiddenError"),
    );
    await rejects(
      `${label} cannot list admin payments`,
      () => getAdminOrders(who, {}),
      named("ForbiddenError"),
    );
    await rejects(
      `${label} cannot change account status`,
      () => setUserStatus(who, { userId: student.id, status: "SUSPENDED" }),
      named("ForbiddenError"),
    );
  }

  // ------------------------------------------- validation / bounds / privacy
  section("Validation, pagination bounds, private fields");
  await rejects(
    "unsupported role filter rejected",
    () => listAdminUsers(admin, { role: "OWNER" }),
    named("ZodError"),
  );
  await rejects(
    "unsupported status filter rejected",
    () => listAdminUsers(admin, { status: "DELETED" }),
    named("ZodError"),
  );
  await rejects(
    "unknown key rejected (strict)",
    () => listAdminUsers(admin, { passwordHash: true }),
    named("ZodError"),
  );
  await rejects(
    "pageSize > 50 rejected",
    () => listAdminUsers(admin, { pageSize: 500 }),
    named("ZodError"),
  );
  await rejects("page 0 rejected", () => listAdminUsers(admin, { page: 0 }), named("ZodError"));
  await rejects(
    "students: role key not accepted",
    () => listAdminStudents(admin, { role: "ADMIN" }),
    named("ZodError"),
  );

  const page1 = await listAdminUsers(admin, { pageSize: 2 });
  check(
    "pagination returns at most pageSize rows",
    page1.users.length <= 2 && page1.pageSize === 2,
  );
  check("total counts every user", page1.total === (await prisma.user.count()));
  const page2 = await listAdminUsers(admin, { pageSize: 2, page: 2 });
  check(
    "page 2 has no overlap with page 1",
    !page2.users.some((u) => page1.users.some((v) => v.id === u.id)),
  );

  const byName = await listAdminUsers(admin, { search: student.name });
  check(
    "search by name finds the user",
    byName.users.some((u) => u.id === student.id),
  );
  const byMail = await listAdminUsers(admin, { search: student.email.toUpperCase() });
  check(
    "search by email is case-insensitive",
    byMail.users.some((u) => u.id === student.id),
  );
  const admins = await listAdminUsers(admin, { role: "ADMIN" });
  check(
    "role filter only returns that role",
    admins.users.length > 0 && admins.users.every((u) => u.role === "ADMIN"),
  );
  const none = await listAdminUsers(admin, { search: `no-such-${randomUUID()}` });
  check("empty result is an empty list, total 0", none.users.length === 0 && none.total === 0);

  const serialized = JSON.stringify([page1, byName, await listAdminStudents(admin, {})]);
  check("no passwordHash in serialized output", !/passwordHash|password_hash/i.test(serialized));
  check(
    "no token/session fields in serialized output",
    !/tokenHash|sessionToken|csrf|resetToken/i.test(serialized),
  );
  check("no bcrypt/argon hash material in output", !/\$2[aby]\$|\$argon2/.test(serialized));

  // ------------------------------------------------------------ students
  section("Admin students");
  const buyer = await freshStudent("Buyer");
  const order = await buy(buyer, paid.slug);
  const listed = await listAdminStudents(admin, { search: buyer.email });
  const row = listed.students.find((s) => s.id === buyer.id);
  const everyStudent = await listAdminStudents(admin, { pageSize: 50 });
  const nonStudents = await prisma.user.count({
    where: { id: { in: everyStudent.students.map((x) => x.id) }, role: { not: "STUDENT" } },
  });
  check(
    "student list contains only STUDENT users",
    everyStudent.students.length > 0 && nonStudents === 0,
  );
  check(
    "enrollment count reflects purchase",
    row?.enrollmentCount === 1 && row.activeEnrollments === 1 && row.completedCourses === 0,
  );
  check("certificate count starts at 0", row?.certificateCount === 0);
  const paidAmount = Number(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).amount,
  );
  check(
    "net spend equals persisted paid order amount",
    row?.netSpend === paidAmount,
    `(got ${row?.netSpend} want ${paidAmount})`,
  );

  section("Refund regression + spend/summary consistency");
  await refundOrder(admin, order.orderId, { reason: "p15 test" });
  const after = (await listAdminStudents(admin, { search: buyer.email })).students.find(
    (s) => s.id === buyer.id,
  );
  check("refund removes the amount from net spend", after?.netSpend === 0);
  check(
    "refund cancels the enrolment (no active enrolments)",
    after?.activeEnrollments === 0 && after.enrollmentCount === 0,
  );
  await rejects("duplicate refund blocked", () => refundOrder(admin, order.orderId), undefined);
  check(
    "exactly one Refund row",
    (await prisma.refund.count({ where: { payment: { orderId: order.orderId } } })) === 1,
  );
  const earning = await prisma.instructorEarning.findFirst({
    where: { orderItem: { orderId: order.orderId } },
  });
  check("instructor earning reversed", earning?.status === "REVERSED");

  // ------------------------------------------------------------ payments
  section("Admin payments pagination / filters");
  const p1 = await getAdminOrders(admin, { pageSize: 1 });
  check("pageSize honoured (bounded page)", p1.orders.length <= 1 && p1.pageSize === 1);
  await rejects(
    "payments pageSize > 50 rejected",
    () => getAdminOrders(admin, { pageSize: 51 }),
    named("ZodError"),
  );
  await rejects(
    "payments unknown status rejected",
    () => getAdminOrders(admin, { status: "WEIRD" }),
    named("ZodError"),
  );
  const byNum = await getAdminOrders(admin, { search: order.orderNumber });
  check(
    "search by order number",
    byNum.orders.length === 1 && byNum.orders[0]?.orderNumber === order.orderNumber,
  );
  const byBuyer = await getAdminOrders(admin, { search: buyer.email });
  check(
    "search by buyer email",
    byBuyer.orders.some((o) => o.orderId === order.orderId),
  );
  const refundedOnly = await getAdminOrders(admin, { refund: "refunded" });
  check(
    "refund filter: refunded only",
    refundedOnly.orders.length > 0 &&
      refundedOnly.orders.every(
        (o) => o.status === "REFUNDED" || o.status === "PARTIALLY_REFUNDED",
      ),
  );
  check(
    "refund filter: refunded order shows reference",
    byNum.orders[0]?.refund?.reference != null,
  );
  const notRefunded = await getAdminOrders(admin, { refund: "not_refunded" });
  check(
    "refund filter: not refunded excludes refunded",
    notRefunded.orders.every((o) => o.status !== "REFUNDED"),
  );
  const oldest = await getAdminOrders(admin, { sort: "oldest", pageSize: 5 });
  check(
    "oldest-first ordering",
    oldest.orders.every((o, i, a) => i === 0 || a[i - 1]!.createdAt <= o.createdAt),
  );
  const s = p1.summary;
  check(
    "summary: net = gross - refunded",
    Math.abs(s.netCollected - (s.grossCollected - s.refundedVolume)) < 0.005,
  );
  const paidSum = await prisma.order.aggregate({
    where: { status: "PAID" },
    _sum: { amount: true },
  });
  check(
    "summary: net collected equals sum of PAID orders",
    Math.abs(s.netCollected - Number(paidSum._sum.amount ?? 0)) < 0.005,
  );
  check(
    "no provider secret fields in payments output",
    !/secret|apiKey|cardNumber/i.test(JSON.stringify(p1)),
  );

  // ------------------------------------------------------ account status
  section("Account status / sessions");
  const victim = await freshStudent("Victim");
  await prisma.session.create({
    data: {
      userId: victim.id,
      tokenHash: `p15-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  await rejects(
    "admin cannot change own status",
    () => setUserStatus(admin, { userId: admin.id, status: "SUSPENDED" }),
    (e) => e instanceof UserAdminError,
  );
  await rejects(
    "cannot suspend another admin",
    () => setUserStatus(admin, { userId: await_admin2().id, status: "SUSPENDED" }),
    (e) => e instanceof UserAdminError,
  );
  await rejects(
    "invalid status rejected",
    () => setUserStatus(admin, { userId: victim.id, status: "ROLE_ADMIN" }),
    named("ZodError"),
  );
  await setUserStatus(admin, { userId: victim.id, status: "SUSPENDED" });
  check(
    "status changed to SUSPENDED",
    (await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).status === "SUSPENDED",
  );
  check(
    "sessions revoked on suspend",
    (await prisma.session.count({ where: { userId: victim.id } })) === 0,
  );
  await rejects(
    "same-status change is refused",
    () => setUserStatus(admin, { userId: victim.id, status: "SUSPENDED" }),
    (e) => e instanceof UserAdminError,
  );
  await setUserStatus(admin, { userId: victim.id, status: "ACTIVE" });
  check(
    "reactivation works",
    (await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).status === "ACTIVE",
  );
  check(
    "role unchanged by status flow",
    (await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).role === "STUDENT",
  );
  check(
    "history intact: orders of a suspended buyer remain",
    (await prisma.order.count({ where: { userId: buyer.id } })) === 1,
  );

  // ------------------------------------------------- instructor isolation
  section("Instructor isolation / privacy");
  const other = paid.instructorId === elena.id ? marcus : elena;
  const buyer2 = await freshStudent("Iso");
  await buy(buyer2, paid.slug);
  const owner = paid.instructorId === elena.id ? elena : marcus;
  const ownList = await listInstructorStudents(owner, { search: buyer2.name });
  const otherList = await listInstructorStudents(other, { search: buyer2.name });
  check("owning instructor sees the student", ownList.students.length === 1);
  check("other instructor does not", otherList.students.length === 0);
  check("instructor list has no email", !JSON.stringify(ownList).includes(buyer2.email));

  // --------------------------------------------- hidden review aggregation
  section("Hidden review aggregation (real moderation path)");
  const reviewer = await freshStudent("Reviewer");
  await buy(reviewer, paid.slug);
  const course = await prisma.course.findFirstOrThrow({
    where: { slug: paid.slug },
    select: { id: true },
  });
  const review = await createCourseReview(reviewer, paid.slug, {
    rating: 1,
    comment: "p15 hidden",
  });
  const reporter = await freshStudent("Reporter");
  await buy(reporter, paid.slug);
  await reportReview(reporter, { reviewId: review.id, reason: "SPAM" });
  const report = await prisma.report.findFirstOrThrow({
    where: { targetId: review.id, targetType: "REVIEW" },
  });
  const before = await prisma.review.aggregate({
    where: { courseId: course.id, hiddenAt: null },
    _count: { _all: true },
  });
  await resolveReport(admin, { reportId: report.id, action: "REVIEW_HIDDEN" });
  const visibleAfter = await prisma.review.aggregate({
    where: { courseId: course.id, hiddenAt: null },
    _count: { _all: true },
  });
  check(
    "hiding removes the review from the visible count",
    visibleAfter._count._all === before._count._all - 1,
  );
  check(
    "hidden review not in the public listing",
    !JSON.stringify(await getReviewsForCourse(course.id)).includes("p15 hidden"),
  );
  await updateCourseReview(reviewer, review.id, { rating: 5, comment: "p15 edited" });
  check(
    "reviewer cannot unhide by editing",
    (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).hiddenAt !== null,
  );
  await rejects(
    "another student cannot edit that review",
    () => updateCourseReview(reporter, review.id, { rating: 5 }),
    (e) => e instanceof ReviewNotFoundError,
  );
  await rejects(
    "instructor cannot resolve reports",
    () => resolveReport(owner, { reportId: report.id, action: "NO_ACTION" }),
    named("ForbiddenError"),
  );
  await rejects(
    "decided report is terminal",
    () => resolveReport(admin, { reportId: report.id, action: "NO_ACTION" }),
    named("ModerationError"),
  );

  // --------------------------------------------------------- category
  section("Category regression");
  const cats = await prisma.category.findMany({ where: { status: "ACTIVE" }, take: 1 });
  check("active categories still queryable", cats.length === 1);

  // ------------------------------------------------ static/pure helpers
  section("Formatters, safe redirect, public stats");
  check("formatPrice(0) is Free", formatPrice(0) === "Free");
  check("formatPrice integer", formatPrice(49) === "$49");
  check("formatPrice decimal keeps cents", formatPrice(49.99) === "$49.99");
  check("formatPrice discount price", formatPrice(19.5) === "$19.50");
  check(
    "safe path accepts internal",
    sanitizeInternalPath("/student/purchases") === "/student/purchases",
  );
  check("safe path rejects //host", sanitizeInternalPath("//evil.example") === null);
  check("safe path rejects absolute URL", sanitizeInternalPath("https://evil.example") === null);
  check("safe path rejects backslash", sanitizeInternalPath("/\\evil.example") === null);
  const stats = await getPlatformStats();
  check(
    "public stats are live counts",
    stats.publishedCourses === (await prisma.course.count({ where: { status: "PUBLISHED" } })),
  );
}

// Second admin used only for the "cannot suspend another admin" check.
let admin2: SafeUser | null = null;
function await_admin2(): SafeUser {
  if (!admin2) throw new Error("admin2 not initialised");
  return admin2;
}

(async () => {
  const id = randomUUID().slice(0, 8);
  admin2 = toSafeUser(
    await prisma.user.create({
      data: {
        name: `P15 Admin ${id}`,
        email: `p15-admin-${id}@example.test`,
        passwordHash: "x",
        role: "ADMIN",
      },
    }),
  );
  await main();
})()
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
