import { useEffect, useState } from "react";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";

import { Button, Card, FormField, Input } from "@/components/ui/kit";
import { formatShortDate } from "@/lib/format";
import {
  changePasswordFn,
  getMySessionsFn,
  revokeOtherSessionsFn,
  revokeSessionFn,
} from "@/server/functions/account";
import type { SessionDTO } from "@/server/dto/account";

/**
 * Real password change (verified server-side against the current hash)
 * and real session/device management (Phase 13 spec items 12–17). Every
 * mutation here goes through server functions that resolve the acting
 * user from the session cookie — there is no client-supplied userId
 * anywhere in this component.
 */
export function SecurityPanel() {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <ActiveSessionsCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const result = await changePasswordFn({
      data: { currentPassword, newPassword, confirmPassword },
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setMessage(result.data.message);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-lg tracking-tight">Change password</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Changing your password signs out every other device you're logged in on.
      </p>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <FormField label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </FormField>
        <FormField label="New password" hint="At least 8 characters.">
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Confirm new password">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </FormField>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-good">{message}</p>}
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Update password
        </Button>
      </form>
    </Card>
  );
}

function ActiveSessionsCard() {
  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  function load() {
    void getMySessionsFn().then(
      (rows) => setSessions(rows),
      () => setError("Couldn't load your active sessions."),
    );
  }

  useEffect(load, []);

  async function handleRevoke(sessionId: string) {
    setBusyId(sessionId);
    setError("");
    const result = await revokeSessionFn({ data: { sessionId } });
    setBusyId(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    load();
  }

  async function handleRevokeOthers() {
    setBusyAll(true);
    setError("");
    const result = await revokeOtherSessionsFn();
    setBusyAll(false);
    setConfirmingAll(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    load();
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg tracking-tight">Active sessions</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Devices currently signed in to your account.
          </p>
        </div>
        {sessions && sessions.length > 1 && (
          <>
            {confirmingAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sign out every other device?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyAll}
                  onClick={handleRevokeOthers}
                >
                  {busyAll && <Loader2 size={14} className="animate-spin" />}
                  Confirm
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmingAll(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmingAll(true)}>
                <LogOut size={14} />
                Sign out other sessions
              </Button>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!sessions ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-panel-2 p-3 ring-1 ring-line"
            >
              <div className="flex items-center gap-3">
                <MonitorSmartphone size={16} className="text-brand-soft" />
                <div>
                  <p className="text-sm">
                    {session.userAgent ?? "Unknown device"}
                    {session.isCurrent && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.15em] text-good">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Last active {formatShortDate(session.lastUsedAt ?? session.createdAt)}
                  </p>
                </div>
              </div>
              {!session.isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === session.id}
                  onClick={() => handleRevoke(session.id)}
                >
                  {busyId === session.id && <Loader2 size={14} className="animate-spin" />}
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
