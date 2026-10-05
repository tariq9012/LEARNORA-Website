import { Prisma } from "../../generated/prisma/client";
import * as preferenceRepository from "../repositories/notification-preference-repository";
import { updateNotificationPreferencesSchema } from "../validation/moderation";
import type { SafeUser } from "../auth/types";
import type { NotificationPreferencesDto } from "../dto/moderation";

/**
 * Per-user notification preferences (Phase 12). Identity is always the
 * session user — every function here takes a SafeUser, never a userId
 * parameter, so preference IDOR (reading/writing someone else's row) is
 * structurally impossible rather than a check that has to be remembered.
 *
 * Defaults: every category starts TRUE (all in-app notifications enabled).
 * There is deliberately no "account-critical" category here — Phase 12 has
 * no security notifications (password reset, new-device login, etc.) that
 * would need to stay always-on; SYSTEM/ANNOUNCEMENT notifications already
 * bypass preferences entirely (see notification-service.ts) rather than
 * occupying a fake togglable category.
 */

const DEFAULTS: NotificationPreferencesDto = {
  courseUpdates: true,
  payments: true,
  refunds: true,
  payouts: true,
  messages: true,
  certificates: true,
  moderation: true,
};

function toDto(row: {
  courseUpdates: boolean;
  payments: boolean;
  refunds: boolean;
  payouts: boolean;
  messages: boolean;
  certificates: boolean;
  moderation: boolean;
}): NotificationPreferencesDto {
  return {
    courseUpdates: row.courseUpdates,
    payments: row.payments,
    refunds: row.refunds,
    payouts: row.payouts,
    messages: row.messages,
    certificates: row.certificates,
    moderation: row.moderation,
  };
}

export async function getMyNotificationPreferences(
  user: SafeUser,
): Promise<NotificationPreferencesDto> {
  const row = await preferenceRepository.findByUserId(user.id);
  return row ? toDto(row) : DEFAULTS;
}

export async function updateMyNotificationPreferences(
  user: SafeUser,
  input: unknown,
): Promise<NotificationPreferencesDto> {
  const parsed = updateNotificationPreferencesSchema.parse(input);
  // Rebuilt via Object.entries so the object literal has exactly the keys the
  // caller provided — no key present with an explicit `undefined` value,
  // which is what exactOptionalPropertyTypes requires for Prisma's update input.
  const data = Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== undefined),
  ) as Prisma.NotificationPreferenceUpdateInput;
  try {
    const updated = await preferenceRepository.update(user.id, data);
    return toDto(updated);
  } catch (error) {
    // No row yet: create the default row (merged with this update) rather
    // than requiring a separate "initialize" step the client would have to
    // remember to call first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      try {
        const created = await preferenceRepository.createDefault(user.id);
        const updated = await preferenceRepository.update(user.id, data);
        void created;
        return toDto(updated);
      } catch (raceError) {
        // Lost a race with a concurrent first-write for the same user — the
        // row now exists, so the update can proceed.
        if (
          raceError instanceof Prisma.PrismaClientKnownRequestError &&
          raceError.code === "P2002"
        ) {
          const updated = await preferenceRepository.update(user.id, data);
          return toDto(updated);
        }
        throw raceError;
      }
    }
    throw error;
  }
}
