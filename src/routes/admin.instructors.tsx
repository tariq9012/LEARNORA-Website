import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import {
  Avatar,
  Button,
  DataTable,
  FormField,
  Modal,
  Pagination,
  SearchBar,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui/kit";
import { useServerList } from "@/hooks/use-server-list";
import { compact, formatShortDate, initialsOf } from "@/lib/format";
import { decideInstructorFn, getAdminInstructorsFn } from "@/server/functions/admin-operations";
import type { AdminInstructorDTO } from "@/server/dto/admin";

export const Route = createFileRoute("/admin/instructors")({
  loader: async () => ({ list: await getAdminInstructorsFn({ data: {} }) }),
  head: () => ({
    meta: [
      { title: "Instructors — Learnora admin" },
      {
        name: "description",
        content: "Instructor accounts, approval status and teaching activity on Learnora.",
      },
      { property: "og:title", content: "Instructors — Learnora admin" },
      { property: "og:description", content: "Learnora instructor administration." },
    ],
  }),
  component: AdminInstructors,
});

const APPROVAL_LABEL: Record<AdminInstructorDTO["approvalStatus"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

function AdminInstructors() {
  const { list } = Route.useLoaderData();
  const { data, filters, setFilter, page, setPage, loading, error, reload } = useServerList({
    initial: list,
    initialFilters: { search: "", approvalStatus: "" },
    fetcher: (p) =>
      getAdminInstructorsFn({
        data: {
          page: p.page,
          ...(p.search && { search: p.search }),
          ...(p.approvalStatus && { approvalStatus: p.approvalStatus }),
        },
      }),
  });

  const [rejecting, setRejecting] = useState<AdminInstructorDTO | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function decide(
    instructor: AdminInstructorDTO,
    decision: "APPROVE" | "REJECT",
    why?: string,
  ) {
    setBusyId(instructor.id);
    setActionError("");
    const result = await decideInstructorFn({
      data: { instructorId: instructor.id, decision, ...(why && { reason: why }) },
    });
    setBusyId(null);
    if (!result.success) {
      setActionError(result.error);
      return false;
    }
    await reload();
    return true;
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (await decide(rejecting, "REJECT", reason)) {
      setRejecting(null);
      setReason("");
    }
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Instructors"
        description="Approve or reject instructor applications and see teaching activity."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBar
            placeholder="Search by name or email"
            value={filters.search}
            onChange={(v) => setFilter("search", v)}
          />
        </div>
        <Select
          value={filters.approvalStatus}
          onChange={(e) => setFilter("approvalStatus", e.target.value)}
          className="w-full sm:w-48"
          aria-label="Filter by approval status"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </Select>
      </div>

      {(error || actionError) && (
        <p className="mb-4 text-sm text-destructive">{error || actionError}</p>
      )}

      <DataTable<AdminInstructorDTO>
        caption="Instructors"
        empty={loading ? "Loading…" : "No instructors match these filters."}
        rows={data.instructors}
        columns={[
          {
            key: "name",
            header: "Instructor",
            render: (i) => (
              <div className="flex items-center gap-3">
                <Avatar initials={initialsOf(i.name)} src={i.avatarUrl} size="sm" />
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{i.email}</p>
                </div>
              </div>
            ),
          },
          {
            key: "status",
            header: "Approval",
            render: (i) => <StatusBadge status={APPROVAL_LABEL[i.approvalStatus]} />,
          },
          { key: "joined", header: "Joined", render: (i) => formatShortDate(i.joinedAt) },
          {
            key: "courses",
            header: "Courses",
            render: (i) => `${i.publishedCourseCount} / ${i.courseCount}`,
          },
          { key: "students", header: "Students", render: (i) => compact(i.studentCount) },
          {
            key: "rating",
            header: "Rating",
            render: (i) => (i.averageRating != null ? i.averageRating : "—"),
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            render: (i) => (
              <div className="flex justify-end gap-2">
                {i.approvalStatus !== "APPROVED" && (
                  <Button
                    size="sm"
                    disabled={busyId === i.id}
                    onClick={() => void decide(i, "APPROVE")}
                  >
                    {busyId === i.id && <Loader2 size={14} className="animate-spin" />}
                    Approve
                  </Button>
                )}
                {i.approvalStatus === "PENDING" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === i.id}
                    onClick={() => setRejecting(i)}
                  >
                    Reject
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onChange={setPage}
        disabled={loading}
      />

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.name}?` : ""}
      >
        <p className="text-sm text-muted-foreground">
          The reason is private — only this instructor and admins can see it.
        </p>
        <div className="mt-4">
          <FormField label="Reason">
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
          </FormField>
        </div>
        {actionError && <p className="mt-3 text-sm text-destructive">{actionError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRejecting(null)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busyId !== null} onClick={confirmReject}>
            Reject instructor
          </Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
