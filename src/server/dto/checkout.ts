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
};

/** Admin-only listing — includes the buyer's safe identity, never payment credentials. */
export type AdminOrderDTO = {
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
};
