# Phase 15 report (summary)

EXECUTED PASS (fresh seeded PostgreSQL `_test` DB each): verify:phase10 104/0, phase11 120/0, phase12 63/0, phase15 73/0, phase15:security 35/0.
EXECUTED PASS: vite build, eslint (src + scripts), tsc (no new errors vs uploaded baseline; 10 pre-existing files still error).
NOT TESTED: browser UI (admin/instructor/student pages, suspend/ban flow in the browser), createServerFn HTTP guards, raw-route CSRF over HTTP, cookie flags, SSE over a live connection.
Note: `prisma migrate deploy` could not run in the sandbox (engine download blocked); migration SQL was applied with psql instead. No schema change, no new migration.

Spend formula: SUM(Order.amount) for the student's orders with status PAID.
Payments summary: gross = PAID+REFUNDED(+PARTIAL), refunded = REFUNDED(+PARTIAL), net = gross - refunded.
