import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/kit";
import {
  getNotificationPreferencesFn,
  updateNotificationPreferencesFn,
} from "@/server/functions/notification-preferences";
import type { NotificationPreferencesDto } from "@/server/dto/moderation";

const CATEGORIES: { key: keyof NotificationPreferencesDto; label: string; hint: string }[] = [
  { key: "courseUpdates", label: "Course updates", hint: "Enrollment, approvals, completions" },
  { key: "messages", label: "Messages", hint: "New replies from students or instructors" },
  { key: "payments", label: "Payments", hint: "Successful purchases" },
  { key: "refunds", label: "Refunds", hint: "Refund confirmations" },
  { key: "payouts", label: "Payouts", hint: "Requested, paid or rejected (instructors)" },
  { key: "certificates", label: "Certificates", hint: "When a certificate is ready" },
  { key: "moderation", label: "Moderation", hint: "Updates on reports you've filed" },
];

/**
 * Real, per-user notification preference toggles (Phase 12). Turning a
 * category off only stops the optional in-app NOTIFICATION record for that
 * category — it never disables the underlying feature (a message still
 * delivers and its unread count still increases even with "Messages" off;
 * a payment/refund/payout is still processed and shows in its own history
 * regardless of this toggle).
 */
export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getNotificationPreferencesFn().then(
      (p) => !cancelled && setPrefs(p),
      () => !cancelled && setError("Couldn't load your notification preferences."),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof NotificationPreferencesDto) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    setError("");
    const result = await updateNotificationPreferencesFn({ data: { [key]: next[key] } });
    if (!result.success) {
      setPrefs(prefs); // revert
      setError(result.error);
      return;
    }
    setPrefs(result.data);
    setSavedAt(Date.now());
  }

  if (error && !prefs) return <p className="text-sm text-destructive">{error}</p>;
  if (!prefs) return <p className="text-sm text-muted-foreground">Loading your preferences…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose which events add an in-app notification. This never affects whether the underlying
        feature works — messages, payments, refunds and payouts are unaffected either way.
      </p>
      {CATEGORIES.map(({ key, label, hint }) => (
        <label key={key} className="flex items-start gap-3 text-sm">
          <Checkbox checked={prefs[key]} onChange={() => void toggle(key)} />
          <span>
            <span className="block">{label}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
        </label>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {savedAt && !error && <p className="font-mono text-[11px] text-good">Saved</p>}
    </div>
  );
}
