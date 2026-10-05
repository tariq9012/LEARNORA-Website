import { getCurrentSessionId } from "../auth/session";
import * as sessionRepository from "../repositories/session-repository";
import type { SafeUser } from "../auth/types";
import type { SessionDTO } from "../dto/account";

export class SessionManagementError extends Error {}

export async function listMySessions(user: SafeUser): Promise<SessionDTO[]> {
  const [sessions, currentSessionId] = await Promise.all([
    sessionRepository.findSessionsForUser(user.id),
    getCurrentSessionId(),
  ]);

  return sessions.map((session) => ({
    id: session.id,
    isCurrent: session.id === currentSessionId,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
    userAgent: session.userAgent ?? null,
  }));
}

/**
 * Revokes one other session. The mutation is scoped to `id + user.id`
 * in the repository itself (never a bare `id`), so a sessionId that
 * belongs to a different user simply matches nothing here — this is the
 * session-IDOR guard, not a check bolted on afterward.
 */
export async function revokeMySession(user: SafeUser, sessionId: string): Promise<void> {
  const currentSessionId = await getCurrentSessionId();
  if (sessionId === currentSessionId) {
    throw new SessionManagementError(
      "That's your current session — use Log out instead of revoking it here.",
    );
  }

  const result = await sessionRepository.deleteSessionForUser(user.id, sessionId);
  if (result.count === 0) {
    throw new SessionManagementError("That session no longer exists.");
  }
}

/** Signs out every device except the one making this request. */
export async function revokeMyOtherSessions(user: SafeUser): Promise<void> {
  const currentSessionId = await getCurrentSessionId();
  await sessionRepository.deleteOtherSessionsForUser(user.id, currentSessionId);
}
