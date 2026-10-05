import { useState } from "react";
import { Flag } from "lucide-react";
import { Button, Modal, Select, Textarea } from "@/components/ui/kit";
import { reportMessageFn, reportReviewFn } from "@/server/functions/moderation";

const REASONS = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment or abuse" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "MISLEADING", label: "Misleading" },
  { value: "OTHER", label: "Other" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

/**
 * A discreet "Report" action for a review or a message. Never rendered for
 * the viewer's own content (the caller decides that) — the server also
 * refuses it either way. Submission is a small confirmation modal so a
 * misclick can't fire a report; the server's own uniqueness guard makes a
 * double-submit harmless regardless.
 */
export function ReportButton({
  target,
  variant = "button",
}: {
  target: { type: "review"; reviewId: string } | { type: "message"; messageId: string };
  variant?: "button" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("SPAM");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    const payload = details.trim() ? { reason, details: details.trim() } : { reason };
    const result =
      target.type === "review"
        ? await reportReviewFn({ data: { reviewId: target.reviewId, ...payload } })
        : await reportMessageFn({ data: { messageId: target.messageId, ...payload } });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    // Reset after the close animation would run; fine to reset immediately since the modal unmounts its content.
    setTimeout(() => {
      setDone(false);
      setError("");
      setDetails("");
      setReason("SPAM");
    }, 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "ghost"
            ? "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
            : "inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-destructive"
        }
      >
        <Flag size={12} /> Report
      </button>
      <Modal
        open={open}
        onClose={close}
        title={done ? "Report submitted" : `Report this ${target.type}`}
        footer={
          done ? (
            <Button onClick={close}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit report"}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <p className="text-sm text-muted-foreground">Thanks — our team will take a look.</p>
        ) : (
          <div className="space-y-3">
            <Select value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Textarea
              placeholder="Optional details"
              maxLength={500}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
