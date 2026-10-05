/** Phase 11 DTOs — explicit shapes, never raw Prisma rows. Ids of OTHER users are never exposed. */

export type NotificationTypeDto =
  | "ENROLLMENT"
  | "COURSE_APPROVED"
  | "COURSE_REJECTED"
  | "NEW_REVIEW"
  | "NEW_MESSAGE"
  | "PAYOUT"
  | "SYSTEM"
  | "ANNOUNCEMENT"
  | "PAYMENT"
  | "REFUND"
  | "COURSE_COMPLETED"
  | "CERTIFICATE_READY";

export type NotificationDto = {
  id: string;
  type: NotificationTypeDto;
  title: string;
  message: string;
  /** A validated INTERNAL path or null — never an external URL. */
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPageDto = {
  items: NotificationDto[];
  /** Pass back as `cursor` for the next (older) page; null when there is no more. */
  nextCursor: string | null;
  unreadCount: number;
};

export type UnreadCountsDto = { notifications: number; messages: number };

export type ConversationSummaryDto = {
  id: string;
  courseTitle: string | null;
  courseSlug: string | null;
  otherName: string;
  otherRole: "STUDENT" | "INSTRUCTOR" | "ADMIN";
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
  /** False when the viewer may read but not send (a student who lost course access). */
  canSend: boolean;
};

export type ConversationListDto = { conversations: ConversationSummaryDto[]; hasMore: boolean };

export type MessageDto = {
  id: string;
  conversationId: string;
  mine: boolean;
  senderName: string;
  /** Plain text. Render as text only — never as HTML. */
  content: string;
  createdAt: string;
};

export type ConversationDetailDto = {
  conversation: ConversationSummaryDto;
  /** Oldest -> newest within this page. */
  messages: MessageDto[];
  /** Cursor for the next OLDER page; null when the start of the conversation is reached. */
  nextCursor: string | null;
};
