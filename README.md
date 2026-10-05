# Learnora: Your Learning Journey

Learnora — Phase 1: Professional LMS Foundation & UI

Build Phase 1 of Learnora, a modern, premium, fully responsive Learning Management System (LMS) inspired by the usability of platforms like Udemy and Coursera, but with a completely original visual identity.

1. Project Overview

Project name: Learnora

Learnora is a professional online learning platform with three user roles:

Student

Instructor

Admin

The final product will eventually become a fully functional full-stack LMS with authentication, database, course management, video lessons, quizzes, assignments, payments, certificates, messaging, notifications, analytics, and more.

For Phase 1, focus on creating the complete frontend foundation, page structure, navigation, reusable components, responsive design, and realistic mock data.

Do NOT try to implement the complete backend yet.

2. Design Direction

Create a premium, modern SaaS/LMS design.

The website should feel:

Professional

Clean

Modern

Trustworthy

Educational

Premium

Easy to navigate

Avoid making it look like a generic template.

Use:

Modern typography

Consistent spacing

Rounded cards

Subtle shadows

Clean icons

Professional buttons

Clear visual hierarchy

Smooth hover states

Responsive layouts

Accessible contrast

Plenty of whitespace

Create a consistent design system that can be reused across the entire application.

Use a professional primary color with a neutral background and supporting accent colors. Keep the overall interface elegant rather than overly colorful.

3. Technology

Use a modern frontend architecture suitable for a production LMS.

Preferred stack:

React

TypeScript

Tailwind CSS

Modern component architecture

Responsive design

Reusable components

Lucide or another professional icon library

Structure the application so that backend/database functionality can easily be added in later phases.

Do not create unnecessary duplicate components or pages.

4. Public Website

Create the following public-facing pages.

Home / Landing Page

Create a professional LMS landing page containing:

Navbar

Learnora logo

Home

Courses

Categories

Become an Instructor

About

Search

Login

Sign Up

Make the navbar responsive with a mobile menu.

Hero Section

Create a strong headline such as:

Learn Skills. Build Your Future.

Supporting text explaining that Learnora helps students learn practical skills from expert instructors.

Include:

Search bar

Browse Courses button

Explore Categories button

Add a professional educational visual/illustration on the right side.

Popular Categories

Create category cards such as:

Web Development

Programming

Data Science

UI/UX Design

Business

Marketing

Cybersecurity

Mobile Development

Each category should have an icon and course count.

Featured Courses

Create professional course cards containing:

Course thumbnail

Category

Course title

Instructor

Rating

Number of reviews

Student count

Course duration

Level

Price

Original price if discounted

Discount badge

Create at least 6 realistic sample courses.

Why Learnora

Create a section explaining benefits:

Learn from experts

Learn at your own pace

Practical projects

Certificates

Lifetime access

How Learnora Works

Show 3 or 4 steps:

Find a course

Enroll

Learn

Earn your certificate

Become an Instructor CTA

Create a visually strong section encouraging instructors to teach on Learnora.

Testimonials

Create realistic student testimonials with:

Avatar

Name

Role

Rating

Review

Statistics

Show platform statistics such as:

10,000+ Students

500+ Courses

100+ Expert Instructors

50,000+ Lessons Completed

Footer

Include:

Learnora logo

About Learnora

Courses

Categories

Become an Instructor

Help Center

Contact

Privacy Policy

Terms

Social media icons

5. Course Browsing

Create a complete Browse Courses page.

Include:

Page title

Search bar

Category filter

Level filter

Price filter

Rating filter

Duration filter

Sorting dropdown

Course grid

Create realistic mock course data.

Course cards must be reusable components.

Add pagination or a Load More interaction.

6. Course Details Page

Create a professional course details page.

Include:

Course Header

Course title

Subtitle

Instructor

Rating

Reviews

Students enrolled

Last updated

Level

Language

Course Preview

Create a large video-preview placeholder with play button.

Course Purchase Card

Include:

Course price

Original price

Discount

Enroll Now button

Add to Wishlist

Course benefits

Course Description

Include a realistic course description.

What You Will Learn

Create a grid/list of learning outcomes.

Course Curriculum

Display:

Section names

Number of lessons

Lesson duration

Preview badges

Example:

Section 1 — Introduction

Welcome to the course

Course roadmap

Setting up the environment

Section 2 — Fundamentals

HTML Basics

CSS Basics

Responsive Design

Section 3 — Advanced Concepts

JavaScript

APIs

Projects

Requirements

Create course requirements section.

Instructor Profile

Include:

Instructor avatar

Name

Expertise

Rating

Number of students

Number of courses

Bio

Student Reviews

Display rating breakdown and several reviews.

7. Authentication UI

Create authentication pages:

Login

Fields:

Email

Password

Remember me

Forgot password

Login button

Social login UI:

Continue with Google

Continue with GitHub

Registration

Fields:

Full name

Email

Password

Confirm password

Role selection

Roles:

Student

Instructor

Do NOT allow users to select Admin during public registration.

Create:

Terms checkbox

Create account button

Forgot Password

Create forgot-password UI.

Reset Password

Create reset-password UI.

For Phase 1 these can use mock interactions only.

Real authentication will be implemented in a later phase.

8. Student Dashboard UI

Create a complete student dashboard layout.

Dashboard sidebar:

Dashboard

My Learning

Browse Courses

Wishlist

Certificates

Messages

Notifications

Profile

Settings

Logout

Main dashboard should include:

Welcome section

Example:

Welcome back, Alex!

Continue your learning journey.

Statistics

Courses Enrolled

Courses Completed

Learning Hours

Certificates

Continue Learning

Show courses with:

Thumbnail

Course title

Instructor

Progress percentage

Progress bar

Continue Learning button

My Courses

Show enrolled courses.

Recommended Courses

Show course cards.

Recent Activity

Display recent learning activity.

Use realistic mock data.

9. Student Course Player UI

Create the frontend UI for the learning/course-player experience.

Layout:

Main Area

Large video player placeholder.

Below video:

Lesson title

Lesson description

Previous Lesson

Next Lesson

Mark as Complete

Sidebar

Course curriculum:

Section 1

Lesson 1 ✓

Lesson 2 ✓

Lesson 3 →

Section 2

Lesson 4

Lesson 5

Lesson 6

Display:

Lesson duration

Completion status

Lock/unlock state

Section progress

At the top show:

Course Progress: 67%

This is UI/mock functionality only in Phase 1.

10. Instructor Dashboard UI

Create a separate instructor dashboard.

Sidebar:

Dashboard

My Courses

Create Course

Students

Reviews

Earnings

Analytics

Messages

Profile

Settings

Logout

Dashboard should contain:

Overview statistics

Total Courses

Total Students

Total Earnings

Average Rating

Course Performance

Create a table showing:

Course

Students

Rating

Revenue

Status

Statuses:

Published

Draft

Pending Review

Revenue Overview

Create a professional revenue chart using mock data.

Recent Reviews

Display recent student reviews.

11. Instructor Course Management UI

Create the frontend structure for:

My Courses

Include:

Course thumbnail

Title

Students

Rating

Revenue

Status

Edit button

View button

Create Course

Create a multi-step course creation interface.

Steps:

Course Information

Curriculum

Pricing

Preview

Submit for Review

Course Information

Fields:

Course title

Subtitle

Description

Category

Level

Language

Course thumbnail upload UI

Learning outcomes

Requirements

Curriculum

Create UI for:

Add Section

Rename Section

Delete Section

Add Lesson

Edit Lesson

Delete Lesson

Drag/reorder UI

Lesson fields:

Lesson title

Video upload UI

Lesson description

Resources/PDF upload UI

Free preview toggle

Do not implement real file uploads yet.

Pricing

Fields:

Course price

Discount price

Preview

Show how the course will appear to students.

Submit for Review

Create a professional submission UI.

12. Admin Dashboard UI

Create a professional admin dashboard.

Sidebar:

Dashboard

Users

Students

Instructors

Courses

Course Approval

Categories

Enrollments

Payments

Reviews

Reports

Certificates

Coupons

Notifications

Platform Settings

Logout

Dashboard should include:

Statistics

Total Users

Students

Instructors

Total Courses

Total Enrollments

Revenue

Revenue Chart

Use realistic mock data.

Recent Users

Create a table.

Recent Courses

Create a table.

Pending Course Approvals

Show courses waiting for admin approval.

13. Admin Management Pages

Create frontend pages/UI for:

Users

Table:

User

Email

Role

Status

Joined Date

Actions

Students

Student management table.

Instructors

Instructor management table.

Courses

Course management table.

Course Approval

Create approval interface containing:

Course information

Instructor

Course preview

Approve button

Reject button

Request changes button

Categories

Create category management UI:

Add category

Edit

Delete

Course count

Payments

Create payment transaction table.

Reviews

Create review moderation UI.

Certificates

Create certificate management page.

Coupons

Create coupon management UI.

Platform Settings

Create settings interface for:

Platform name

Logo

Email

Currency

Notifications

General settings

14. Additional Student Pages

Create UI pages for:

Wishlist

Show saved courses.

Certificates

Show earned certificates with:

Certificate title

Course

Date

View Certificate button

Download button UI

Notifications

Create notification center.

Messages

Create messaging interface:

Conversation list

Chat area

Message input

Student Profile

Include:

Profile photo

Name

Bio

Email

Learning statistics

Enrolled courses

Settings

Create settings sections:

Account

Password

Notifications

Privacy

15. Instructor Profile

Create a professional instructor profile page containing:

Profile image

Name

Bio

Expertise

Rating

Students

Courses

Social links

Published courses

16. Responsive Design

The entire application must work properly on:

Desktop

Laptop

Tablet

Mobile

Do not simply shrink the desktop layout.

Create proper mobile layouts for:

Navbar

Sidebar

Course grids

Tables

Dashboard

Course player

Forms

Admin pages

Tables should become horizontally scrollable or transform appropriately on mobile.

17. Reusable Components

Create reusable components wherever appropriate:

Navbar

Footer

Sidebar

CourseCard

CategoryCard

Rating

Button

Modal

FormField

SearchBar

FilterPanel

ProgressBar

StatCard

DataTable

Badge

Avatar

NotificationItem

ReviewCard

CourseCurriculum

VideoPlayerPlaceholder

Avoid duplicated code.

18. Routing

Set up proper frontend routes for all major pages.

Public routes:

/

/courses

/courses/:id

/categories

/login

/register

/forgot-password

/reset-password

/instructors/:id

Student routes:

/student/dashboard

/student/learning

/student/course/:id

/student/wishlist

/student/certificates

/student/messages

/student/notifications

/student/profile

/student/settings

Instructor routes:

/instructor/dashboard

/instructor/courses

/instructor/courses/create

/instructor/courses/:id/edit

/instructor/students

/instructor/reviews

/instructor/earnings

/instructor/analytics

/instructor/messages

/instructor/profile

/instructor/settings

Admin routes:

/admin/dashboard

/admin/users

/admin/students

/admin/instructors

/admin/courses

/admin/course-approval

/admin/categories

/admin/enrollments

/admin/payments

/admin/reviews

/admin/reports

/admin/certificates

/admin/coupons

/admin/notifications

/admin/settings

19. Mock Data

Use realistic mock data for:

Users

Courses

Instructors

Categories

Reviews

Enrollments

Notifications

Messages

Revenue

Certificates

Do not use meaningless placeholder text such as "Lorem ipsum".

Make the platform feel like a real product.

20. Important Phase 1 Restrictions

For this phase:

DO NOT implement:

Real database

Real authentication

Real payment processing

Real video storage

Real file uploads

Real email system

Real certificates generation

Real instructor payouts

Real backend APIs

Instead, build the frontend architecture and realistic mock interactions so these systems can be connected in future phases.

However, design the code architecture so Phase 2 can add backend/database/authentication without rebuilding the entire frontend.

21. Quality Requirements

The final Phase 1 application should feel like a real commercial LMS product rather than a basic student project.

Requirements:

No broken links

No empty pages

No obvious placeholder sections

Consistent UI

Consistent spacing

Responsive design

Accessible forms

Clear loading/empty/error states where appropriate

Hover states

Proper buttons

Professional icons

Clean component structure

Maintainable code

No unnecessary duplication

Use realistic content and professional copy throughout the application.

22. Future Architecture

Keep the project ready for future phases.

Future phases will add:

Phase 2:

Database

Authentication

Student/Instructor/Admin roles

Backend integration

Phase 3:

Course creation and management

Phase 4:

Video learning

Progress tracking

Quizzes

Assignments

Phase 5:

Reviews

Wishlist

Notifications

Messaging

Phase 6:

Payments

Enrollment

Instructor earnings

Phase 7:

Certificates

Phase 8:

Admin analytics and advanced management

Phase 9:

Security, testing, optimization and deployment

Do not implement these future phases now.

Final Goal for Phase 1

When Phase 1 is complete, I should be able to navigate through a convincing, professional Learnora LMS frontend and experience the complete user interface for:

Student + Instructor + Admin

with realistic mock data and interactions.

The application should look and feel like a serious commercial LMS that is ready to have its backend and database connected in the next phase.

Before finishing, check every route and major interaction and make sure there are no obvious broken states or unfinished sections.

## Tech Stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [TanStack Start](https://tanstack.com/start) (SSR framework) + [TanStack Router](https://tanstack.com/router)
- [TanStack Query](https://tanstack.com/query) for data fetching/caching
- [Tailwind CSS 4](https://tailwindcss.com) with [shadcn/ui](https://ui.shadcn.com) (Radix UI primitives)
- [Vite](https://vite.dev) build tooling, served through [Nitro](https://nitro.build)
- [npm](https://www.npmjs.com) as the package manager
- [PostgreSQL](https://www.postgresql.org) + [Prisma ORM](https://www.prisma.io) for the database (Phase 2)

Phase 1 was a frontend-only foundation with realistic mock data. Phase 2 (this codebase) adds the real database schema and server-side architecture; the frontend still reads from `src/data/mock.ts` until a later migration phase connects it to Prisma. Authentication, payments, and file uploads are intentionally not implemented yet.

## Development

You'll need [Node.js](https://nodejs.org) and npm installed locally.

```sh
git clone <this-repository-url>
cd <repository-name>
npm install
npm run dev
```

Other useful scripts:

```sh
npm run build     # production build
npm run preview   # preview the production build locally
npm run lint      # run ESLint
npm run format    # format with Prettier
```

## Database setup

The app expects a PostgreSQL database, managed through Prisma ORM 7, which uses a driver adapter (`@prisma/adapter-pg`) plus a separate `prisma.config.ts` file for CLI/connection configuration — connection URLs no longer live in `prisma/schema.prisma` itself.

1. **Have a PostgreSQL instance available.**
   - **Neon (recommended for quick setup):** create a project at [neon.tech](https://neon.tech), then copy both connection strings from the dashboard — the **pooled** one (hostname contains `-pooler`) and the **direct/unpooled** one.
   - **Local Docker instead:**
     ```sh
     docker run --name learnora-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=learnora -p 5432:5432 -d postgres:16
     ```
2. **Create your `.env` file** from the template:
   ```sh
   cp .env.example .env
   ```
   Then set:
   - `DATABASE_URL` — the connection the **app** queries through at runtime (Neon: the **pooled** string). Used by `src/server/db/client.ts`.
   - `DIRECT_URL` — the connection the **Prisma CLI** uses for migrations/introspection (Neon: the **direct/unpooled** string), read by `prisma.config.ts`. If your provider has no pooler, this can be the same value as `DATABASE_URL`.
3. **Install dependencies** (if you haven't already):
   ```sh
   npm install
   ```
4. **Generate the Prisma client:**
   ```sh
   npm run db:generate
   ```
   This writes the generated client to `src/generated/prisma` (gitignored — regenerate it after every schema change or fresh `npm install`).
5. **Create and apply the initial migration:**
   ```sh
   npm run db:migrate
   ```
6. **Seed development data** (an admin, two instructors, a few students, categories, and courses with sections/lessons):
   ```sh
   npm run db:seed
   ```
7. **Start the app:**
   ```sh
   npm run dev
   ```

Other database scripts:

```sh
npm run db:studio          # open Prisma Studio to browse data
npm run db:push            # push schema changes without a migration (prototyping only)
npm run db:migrate:deploy  # apply existing migrations (CI/production)
```

The Prisma schema lives in `prisma/schema.prisma`; CLI connection config and the seed command live in `prisma.config.ts`. The Prisma client singleton (built with the `@prisma/adapter-pg` driver adapter) is in `src/server/db/client.ts` (re-exported from `src/lib/db.ts`). Business logic sits in `src/server/services/`, with `src/server/repositories/` as the only layer that talks to Prisma directly, and `src/server/validation/` holding the Zod schemas. None of the existing UI is wired to this yet — that happens in a later phase.

## Phase 10 — earnings, refunds and payouts (simulated)

- **Instructor earnings** come only from persisted `InstructorEarning` rows created when a paid purchase commits — never from current course price × enrollments. Each row keeps the split it was created with.
- **Revenue share / minimum payout** are server-side config: `INSTRUCTOR_REVENUE_SHARE_PERCENT` (default 70) and `MINIMUM_PAYOUT_AMOUNT` (default 50). See `src/server/config/finance-policy.ts`.
- **Earning lifecycle:** `AVAILABLE` (immediately after a paid purchase) → `RESERVED` (locked in a pending payout) → `PAID`; or `REVERSED` when the order is refunded.
- **Refunds:** admin only, full refunds only, simulated (`/admin/payments`). One transaction: payment + order → `REFUNDED`, refund row, earning `REVERSED`, enrollment `CANCELLED`. Blocked while the earning is in a pending payout (reject that payout first) or already paid out (needs a manual/offline adjustment).
- **Payouts:** the instructor requests their whole available balance (`/instructor/earnings`); an admin approves ("mark paid") or rejects it (`/admin/payouts`). **No real funds are transferred and no bank/card details are collected.**
- **Sample data:** `npm run db:seed` adds four sample paid orders and one pending payout (idempotent).
- **Verification script:** `npm run verify:phase10` runs the real services against a real database. It refuses to run unless the database name ends in `_test` (create a throwaway DB, run `npx prisma migrate deploy` and `npm run db:seed` on it first).

## Phase 11 — notifications and messaging

- **Notifications** are real rows in PostgreSQL (`/student|instructor|admin/notifications`, plus unread badges in the sidebar). Identity always comes from the session; nothing accepts a `userId`. Lists are cursor-paginated (max 50 per page). A notification can only link to an internal app path (`src/lib/safe-path.ts` checks it on write and again on click).
- **Automatic events** (all built in `src/server/services/notification-events.ts`): payment success, free enrollment, refund (student + instructor), payout requested/paid/rejected, course approved/rejected, course completed (once), certificate ready (once), new message. Payment **failure** is deliberately not notified, and a paid enrollment is announced by the payment notification only.
- **No duplicates:** every retryable event has a stable `eventKey` (unique per user), e.g. `refund:<refundId>`. Financial notifications are created **after** the money transaction commits and are best-effort, so a notification problem can never undo a payment, refund or payout. The new-message notification is created **in the same transaction** as the message.
- **Messaging** is course-related student ↔ instructor only. A student can start a thread only while they hold an ACTIVE/COMPLETED enrollment in that course (the "Message instructor" button in the course player). A refunded (CANCELLED) student can still read the history but cannot send or start new threads. Admins have no access to conversations.
- **Idempotent sends:** the browser sends a fresh `clientMessageId` per composed message; a retry with the same id returns the original message (no second row, no second notification). Messages are plain text (max 2000 chars) and always rendered as text. Sending is limited to 30 messages/minute/user (in-memory limiter, single instance).
- **Refresh:** no WebSockets. Mutations refresh the UI immediately; unread badges poll every 30 s and an open inbox every 20 s, only while the tab is visible. A future SSE/WebSocket layer only needs to call `requestCommRefresh()` (`src/lib/comm-refresh.ts`).
- **Sample data:** `npm run db:seed` adds one Sara ↔ Elena conversation (last message unread for Sara) and a few notifications; it is idempotent.
- **Verification:** `npm run verify:phase11` (and `verify:phase10`). Each needs its own freshly migrated + seeded database whose name ends in `_test`, because the scripts create orders, refunds, payouts and messages.

## Phase 12 — reporting, moderation, notification preferences, SSE

- **Reporting** (`ReportReason` enum: SPAM/HARASSMENT/INAPPROPRIATE/MISLEADING/OTHER) covers reviews and messages only. A student/instructor can't report their own content; a message report requires being a participant. A database partial-unique index blocks a second OPEN/IN_REVIEW report from the same user against the same target (they can report again after it's resolved).
- **Message report snapshot:** reporting a message captures its text, sender and course into `Report.contentSnapshot` at that moment — a later edit or removal of the message never changes the evidence an admin sees.
- **Admin privacy boundary (unchanged from Phase 11):** a message report gives the admin only that snapshot — there is no "view conversation" server function anywhere, for anyone, including admins.
- **Moderation** (`/admin/reports`): resolve with an action (hide/restore a review, remove a message, or "no action") or dismiss. Hiding a review sets `Review.hiddenAt`; every public listing and rating aggregation already filters `hiddenAt: null`, so the average, count and breakdown update immediately. Removing a message sets `Message.removedAt` — the row and its real text are kept (for the report record), but every participant now sees "Message removed by moderation." A report can only be decided once (conditional update; a race resolves to exactly one winner).
- **Notification preferences** (Settings → Notifications, real per-user rows, default all-enabled): `courseUpdates`, `messages`, `payments`, `refunds`, `payouts`, `certificates`, `moderation`. Enforcement is centralized in `notification-service.ts` — every call site in `notification-events.ts` passes a category, and disabling one only skips the optional notification row. It never disables the underlying feature: a message still delivers and its unread count still increases with "messages" off; a payment/refund/payout still processes and shows in its own history either way.
- **SSE** (`/api/events`, authenticated via the session cookie, no user id of any kind in the URL): delivers a bare category hint (`notification_changed`, `message_changed`, `payout_changed`, `refund_changed`, `report_changed`) that triggers a normal, authorized re-fetch — never message text or financial data. The Phase 11 polling fallback (30 s badges / 20 s open inbox) is untouched and keeps working with or without SSE. The broker (`realtime-service.ts`) is an in-memory, single-instance map, like the rate limiter.
- **Verification:** `npm run verify:phase12` (plus `verify:phase10`/`verify:phase11`), each needing its own freshly migrated + seeded database whose name ends in `_test`.

## Phase 15 — admin users/students, payments hardening, security audit

- **`/admin/users`, `/admin/students`:** PostgreSQL-backed, server-side search/filter/sort/pagination (page size max 50). Explicit field allow-lists — no password hash, session, token or message data. Role is read-only. Admins can suspend / ban / reactivate students and instructors (never themselves or another admin); this signs the user out everywhere and is enforced by login and the session check. Nothing is deleted.
- **Student "net spend":** `SUM(Order.amount)` of the student's orders currently `PAID` (persisted amounts; a refunded order becomes `REFUNDED` and stops counting).
- **`/admin/payments`:** paginated (max 50) with order-number / name / email search, status, refunded filter and date order. Summary: gross = paid + refunded orders, refunded, net = gross − refunded (same as dashboard platform revenue). These are not instructor earnings.
- **Homepage/About:** live counts from the database (active students, published courses, approved instructors, completed lessons). Invented claims and fake testimonials were removed.
- **Verification:** `npm run verify:phase15` and `npm run verify:phase15:security`. Both refuse any database whose name does not end in `_test`. Run each verify script on a freshly migrated and seeded `_test` database — they share global totals and can skew each other.

### Known limitations

- **Payments are simulated.** No real money moves. Real-money use needs a real payment provider with verified webhooks — not part of Phase 16.
- **Rate limiting and realtime (SSE) are in-memory and single-instance.** See "Realtime" below.
- **Rate limiting trusts `x-forwarded-for`:** run behind a proxy that overwrites it.
- Account deletion/deactivation by the user is not implemented.

## Phase 16 — production infrastructure

### Local development (defaults, nothing extra to configure)

PostgreSQL + `STORAGE_PROVIDER=local` (files in `./storage/uploads`) + `EMAIL_PROVIDER=console` (password-reset links are printed in the server log). `APP_URL` defaults to `http://localhost:3000`.

### Production configuration

Set these in your host's secret manager (never commit them). See `.env.example` for every variable.

| Variable                                                                                                         | Production requirement                                    |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `NODE_ENV`                                                                                                       | `production`                                              |
| `DATABASE_URL`, `DIRECT_URL`                                                                                     | production PostgreSQL (e.g. Neon pooled + direct strings) |
| `SESSION_SECRET`                                                                                                 | 32+ random characters, not the placeholder                |
| `APP_URL`                                                                                                        | your public `https://` URL                                |
| `STORAGE_PROVIDER=s3` + `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT` (R2) | S3-compatible storage; private bucket                     |
| `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`, `EMAIL_FROM`                                                         | verified sender domain in Resend                          |

If production is misconfigured (e.g. console email, http `APP_URL`, local storage without `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`), the app refuses to serve requests and logs which variables are wrong (names only, never values). Note: this happens on the first request, not as a process exit.

### Storage

- `local`: development, or a single server with a persistent volume. **Not durable on serverless/ephemeral filesystems** (files vanish on redeploy).
- `s3`: Cloudflare R2, AWS S3 or another S3-compatible service via `@aws-sdk/client-s3`. Keep the bucket **private** — Learnora streams files through its own authorized routes (enrollment checks, HTTP Range/206 for video); no bucket or signed URLs are sent to browsers.
- Each asset records where it is stored, so files uploaded locally keep working after you switch to S3. Moving old files into S3 is not automated.
- Object keys are generated by the server; uploaded filenames are display-only.

### Email

Password-reset emails go through the configured provider: `console` (development), `gmail` (SMTP + app password, via nodemailer) or `resend`. Exactly one provider is used — the one named in `EMAIL_PROVIDER`; there is no automatic fallback. Delivery runs in the background and failures are logged without the token or address; the forgot-password response is identical whether or not the account exists. Only the password-reset email exists; email verification / change notifications are not implemented.

### Health endpoints

- `GET /api/health` — liveness, always `{"status":"ok"}`, no database access.
- `GET /api/ready` — readiness: configuration parses and the database answers `SELECT 1` (2 s cap). `200 ready` or `503 not_ready` with per-check `ok/fail` only. It never writes, creates storage objects or sends email.

### Migrations, build, start

```
npm install
npm run db:generate
npm run db:migrate:deploy      # applies committed migrations; never resets data
npm run build
node .output/server/index.mjs  # PORT env var selects the port
```

Phase 16 adds one additive migration (`StorageProviderKind` gains `S3`); existing rows are untouched.

### Realtime (SSE) — single instance only

`/api/events` uses an in-memory broker: it is correct on **one** server instance. Running several instances needs a shared pub/sub (e.g. Redis) so events reach the instance holding each user's connection. Polling fallback keeps working regardless. Redis was intentionally not added in Phase 16.

### Payments

Simulated only. Do not use for real money.

### Not tested by the maintainers of this repo

No hosting provider has been deployed to or tested. Real Cloudflare R2 / AWS S3, real Resend delivery and real Gmail delivery have not been exercised; they were tested only against a local fake S3 server, a fake HTTP client and a local fake SMTP server.

## Phase 17 — production deployment & hardening

Target stack: Vercel + Neon PostgreSQL + Cloudflare R2 + Gmail/Resend. Payments stay **simulated**.
The full step-by-step procedure, environment variable list, limits and smoke tests are in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

What changed:

- `npm run build` now runs `prisma generate` first (the Prisma client in `src/generated` is not committed). Use `npm run build:app` to build without regenerating.
- `prisma.config.ts` no longer needs `DIRECT_URL` just to run `prisma generate`; commands that touch the database still need it.
- `npm run db:seed` (demo accounts with known passwords) refuses to run in production or against a non-local database unless `ALLOW_DEMO_SEED=true`. For a real first admin use `npm run admin:create` (see DEPLOYMENT.md).
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`) are set on all responses. CSP is intentionally not set yet.
- `vite-tsconfig-paths` was replaced by Vite's native `resolve.tsconfigPaths`.
- ESLint no longer scans generated Prisma code.
- Vercel + `STORAGE_PROVIDER=local` is rejected at startup.

Known limitations (details in DEPLOYMENT.md): Vercel's ~4.5 MB request-body limit blocks large uploads through the server; the rate limiter and SSE broker are per-instance; deferred media rendering investigation (R2 CourseCard); simulated payments only.

Development is unchanged: `npm install`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`.

## Phase 18 — direct-to-Cloudflare-R2 uploads

With `STORAGE_PROVIDER=s3` the browser now uploads large media **straight to the private R2 bucket** using a short-lived presigned `PUT`
(intent → upload → finalize), so Vercel's ~4.5 MB request-body limit no longer applies. Local development (`STORAGE_PROVIDER=local`)
keeps the original server-mediated upload.

- New: `UploadIntent` table (one additive migration), `POST /api/media/upload-intent`, `POST /api/media/upload-finalize`, `src/lib/direct-upload.ts`, `npm run media:cleanup-intents`.
- Required one-time setup for R2: a CORS rule allowing `PUT` from your site's origin — see **DEPLOYMENT.md §5**.
- The old upload routes refuse requests in R2 mode; delete and playback routes are unchanged.
- tests: `npm run verify:phase18`, `verify:phase18:local`, `verify:phase18:http`, `verify:phase18:client` (fake S3 — not a real-R2 test).
