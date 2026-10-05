export type CheckoutDTO = {
  courseSlug: string;
  courseTitle: string;
  thumbnailUrl: string | null;
  instructorName: string;
  amount: number;
  /** Present only when a discount applies — the crossed-out original price. */
  originalAmount: number | null;
  currency: string;
};

export type OrderStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export type OrderSummaryDTO = {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  courseSlug: string;
  courseTitle: string;
  instructorName: string;
  createdAt: string;
  /** The most recent payment attempt's status, or null if none has been made yet. */
  paymentStatus: OrderStatus | null;
};

export type PurchaseHistoryItemDTO = {
  orderId: string;
  orderNumber: string;
  courseSlug: string;
  courseTitle: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  /** Set when the order was refunded (Phase 10) — lets the UI say "Refunded on …". */
  refundedAt: string | null;
};

/** Admin-only listing — includes the buyer's safe identity, never payment credentials. */
export type AdminOrderDTO = {
  /** Same value as orderId — present so DataTable (which keys rows by `id`) can render it. */
  id: string;
  orderId: string;
  orderNumber: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: OrderStatus | null;
  paymentProvider: string | null;
  createdAt: string;
  /** Server-computed (see refund-policy.ts): true only if an admin can refund this order right now. */
  refundable: boolean;
  /** For a PAID order that can't be refunded: why (e.g. the earning is in a pending payout). Null otherwise. */
  refundBlockedReason: string | null;
  /** Set once refunded. */
  refund: { reference: string; processedAt: string | null } | null;
};

/** Phase 15: bounded, filtered page of admin orders + global (unfiltered) money summary. */
export type AdminOrderListDTO = {
  orders: AdminOrderDTO[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdminPaymentSummaryDTO;
};

/**
 * All figures are from persisted Order.amount grouped by CURRENT order status:
 *   grossCollected = PAID + REFUNDED + PARTIALLY_REFUNDED orders
 *   refundedVolume = REFUNDED + PARTIALLY_REFUNDED orders
 *   netCollected   = grossCollected - refundedVolume  (== PAID orders; same as the dashboard's platformRevenue)
 * Failed/pending orders never count as money collected. None of these is instructor earnings.
 */
export type AdminPaymentSummaryDTO = {
  grossCollected: number;
  refundedVolume: number;
  netCollected: number;
  paidCount: number;
  refundedCount: number;
  failedCount: number;
  pendingCount: number;
  currency: string;
};
