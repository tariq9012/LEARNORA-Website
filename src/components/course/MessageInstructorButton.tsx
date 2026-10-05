import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/kit";
import { getOrCreateCourseConversationFn } from "@/server/functions/messaging";

/**
 * "Message instructor" entry point for the course player. Only rendered where
 * the student already has course access; the server re-checks the entitlement
 * (and derives the instructor from the course) — this button decides nothing.
 */
export function MessageInstructorButton({ courseSlug }: { courseSlug: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await getOrCreateCourseConversationFn({ data: { courseSlug } });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/student/messages", search: { c: result.data.id } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={open} disabled={busy}>
        <MessageSquare size={14} /> {busy ? "Opening…" : "Message instructor"}
      </Button>
      {error && <span className="max-w-48 text-xs leading-tight text-destructive">{error}</span>}
    </>
  );
}
