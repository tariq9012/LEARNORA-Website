import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { UserTable } from "@/components/dashboard/UserTable";
import { Button, Modal, Pagination, SearchBar, Select, StatCard } from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatShortDate } from "@/lib/format";
import { getAdminUsersFn, setUserStatusFn } from "@/server/functions/admin-operations";
import type { AdminUserDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/users")({
  loader: async () => ({ list: await getAdminUsersFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Users — Learnora admin" },
      {
        name: "description",
        content: "Search, review and manage account status for every account on Learnora.",
      },
      { property: "og:title", content: "Users — Learnora admin" },
      { property: "og:description", content: "Learnora user administration." },
    ],
  }),
  component: AdminUsers,
});

type NextStatus = AdminUserDTO["status"];

const STATUS_ACTIONS: Record<NextStatus, { label: string; blurb: string }> = {
  ACTIVE: { label: "Reactivate account", blurb: "The user will be able to sign in again." },
  SUSPENDED: {
    label: "Suspend account",
    blurb: "Signs the user out everywhere and blocks sign-in until reactivated.",
  },
  BANNED: {
    label: "Ban account",
    blurb: "Signs the user out everywhere and blocks sign-in. Reactivation is still possible.",
  },
};

function AdminUsers() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error, reload } = useServerList({
    initial: list,
    initialFilters: { search: "", role: "", status: "", sort: "newest" },
    fetcher: (p) =>
      getAdminUsersFn({
        data: {
          page: p.page,
          sort: p.sort as "newest" | "oldest",
          ...(p.search && { search: p.search }),
          ...(p.role && { role: p.role as AdminUserDTO["role"] }),
          ...(p.status && { status: p.status as AdminUserDTO["status"] }),
        },
      }),
  });

  const [selected, setSelected] = useState<AdminUserDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  function close() {
    if (busy) return;
    setSelected(null);
    setActionError("");
  }

  async function change(status: NextStatus) {
    if (!selected || busy) return;
    setBusy(true);
    setActionError("");
    try {
      const result = await setUserStatusFn({ data: { userId: selected.id, status } });
      if (!result.success) setActionError(result.error);
      // Refetch on success AND failure so the row is never stale — no F5 needed.
      await reload();
      if (result.success) setSelected(null);
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const options = selected
    ? (["ACTIVE", "SUSPENDED", "BANNED"] as const).filter((s) => s !== selected.status)
    : [];

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Users"
        description="Every student, instructor and administrator. Roles are read-only; you can suspend, ban or reactivate students and instructors."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard label="Accounts matching filters" value={compact(data.total)} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search by name or email"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.role}
          onChange={(e) => setFilter("role", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          <option value="STUDENT">Students</option>
          <option value="INSTRUCTOR">Instructors</option>
          <option value="ADMIN">Admins</option>
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => setFilter("sort", e.target.value)}
          className="w-full sm:w-40"
          aria-label="Sort by joined date"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <UserTable
        users={data.users}
        emptyMessage={loading ? "Loading…" : "No users match these filters."}
        busyUserId={busy ? selected?.id : null}
        onManage={(u) => {
          setActionError("");
          setSelected(u);
        }}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />

      <Modal
        open={selected !== null}
        onClose={close}
        title={selected?.name ?? "User"}
        {...(selected ? { description: selected.email } : {})}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <span className="capitalize">{selected.role.toLowerCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize">{selected.status.toLowerCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Joined</span>
                <span>{formatShortDate(selected.joinedAt)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Orders, payments, reviews, messages and certificates are never deleted or changed by a
              status change.
            </p>
            {actionError && (
              <p role="alert" className="text-destructive">
                {actionError}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="ghost" onClick={close} disabled={busy}>
                Close
              </Button>
              {options.map((s) => (
                <Button
                  key={s}
                  variant={s === "ACTIVE" ? "outline" : "destructive"}
                  disabled={busy}
                  title={STATUS_ACTIONS[s].blurb}
                  onClick={() => change(s)}
                >
                  {busy ? "Saving…" : STATUS_ACTIONS[s].label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
