import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { DashboardLayout, DashboardHeader } from "@/components/layout/DashboardLayout";
import { Badge, Button, Card, EmptyState, Modal } from "@/components/ui/kit";
import {
  approveCourseFn,
  getAdminCourseReviewFn,
  getPendingCoursesFn,
  rejectCourseFn,
} from "@/server/functions/admin-course";
import type { AdminCourseReviewDTO } from "@/server/dto/admin-course";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/admin/course-approval")({
  loader: async () => {
    const queue = await getPendingCoursesFn();
    const details = await Promise.all(
      queue.map((c) => getAdminCourseReviewFn({ data: { courseId: c.id } })),
    );
    return { courses: details.filter((c): c is AdminCourseReviewDTO => c !== null) };
  },
  head: () => ({
    meta: [
      { title: "Course approval — Learnora admin" },
      {
        name: "description",
        content: "Review, approve or reject courses submitted by Learnora instructors.",
      },
      { property: "og:title", content: "Course approval — Learnora admin" },
      { property: "og:description", content: "The Learnora course review queue." },
    ],
  }),
  component: CourseApproval,
});

function CourseApproval() {
  const { courses: initial } = Route.useLoaderData();
  const [queue, setQueue] = useState(initial);
  const [rejecting, setRejecting] = useState<AdminCourseReviewDTO | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(course: AdminCourseReviewDTO) {
    setBusyId(course.id);
    setError("");
    try {
      const result = await approveCourseFn({ data: { courseId: course.id } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setQueue((prev) => prev.filter((c) => c.id !== course.id));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setError("");
    try {
      const result = await rejectCourseFn({ data: { courseId: rejecting.id, reason } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setQueue((prev) => prev.filter((c) => c.id !== rejecting.id));
      setRejecting(null);
      setReason("");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardLayout role="admin">
      <DashboardHeader
        title="Course approval"
        description="Submissions waiting on a decision. Approving publishes the course immediately to the public catalogue."
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {queue.length === 0 ? (
        <EmptyState
          icon={Check}
          title="Queue is clear"
          description="Every submitted course has been reviewed."
        />
      ) : (
        <div className="space-y-4">
          {queue.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl tracking-tight">{c.title}</h2>
                    <Badge tone="warn">Pending Review</Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{c.subtitle}</p>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    {c.instructorName} · {c.category} · {c.level} · {c.totalDuration} ·{" "}
                    {c.price === 0 ? "Free" : formatPrice(c.price)}
                    {c.submittedAt && <> · submitted {c.submittedAt}</>}
                  </p>
                  {c.instructorApprovalStatus !== "APPROVED" && (
                    <p className="mt-2 font-mono text-[10px] text-warn">
                      Note: instructor approval status is {c.instructorApprovalStatus}.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRejecting(c)}
                    disabled={busyId === c.id}
                  >
                    <X size={14} /> Reject
                  </Button>
                  <Button size="sm" onClick={() => approve(c)} disabled={busyId === c.id}>
                    <Check size={14} /> Approve
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Outcomes
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.learningOutcomes.slice(0, 3).map((o) => (
                      <li key={o}>· {o}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Curriculum
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {c.sectionCount} sections · {c.lessonCount} lessons
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => {
          setRejecting(null);
          setReason("");
        }}
        title="Reject submission"
        {...(rejecting?.title && { description: rejecting.title })}
      >
        <textarea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Rejection reason"
          placeholder="Tell the instructor what needs to change… (at least 10 characters)"
          className="w-full resize-y rounded-lg bg-panel-2 px-3.5 py-2.5 text-sm text-cream outline-none ring-1 ring-line focus:ring-brand/60"
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setRejecting(null);
              setReason("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmReject}
            disabled={reason.trim().length < 10 || busyId === rejecting?.id}
          >
            Send rejection
          </Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
