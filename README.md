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

