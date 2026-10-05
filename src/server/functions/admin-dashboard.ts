import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "../auth/guards";
import { getAdminDashboard, getRecentPayments } from "../services/admin-dashboard-service";
import type { AdminDashboardDTO, AdminRecentPaymentDTO } from "../dto/admin";

export const getAdminDashboardFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminDashboardDTO> => {
    const admin = await requireAdmin();
    return getAdminDashboard(admin);
  },
);

export const getAdminRecentPaymentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminRecentPaymentDTO[]> => {
    const admin = await requireAdmin();
    return getRecentPayments(admin);
  },
);
