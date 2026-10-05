/**
 * Opaque keyset-pagination cursors: base64url("<ISO createdAt>|<id>").
 * Ordering is always (createdAt DESC, id DESC), so pages are stable even
 * when several rows share a timestamp, and new rows arriving mid-browse
 * never shift or repeat items.
 */
export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor.");
    this.name = "InvalidCursorError";
  }
}

export type DecodedCursor = { createdAt: Date; id: string };

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): DecodedCursor {
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }
  const [iso, id, ...rest] = text.split("|");
  if (!iso || !id || rest.length > 0 || !/^[A-Za-z0-9_-]{1,64}$/.test(id))
    throw new InvalidCursorError();
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) throw new InvalidCursorError();
  return { createdAt, id };
}

/** Prisma `where` fragment selecting rows strictly OLDER than the cursor. */
export function olderThan(cursor: DecodedCursor) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}
