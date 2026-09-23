import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { SafeUser } from "./server/auth/types";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, user: null as SafeUser | null },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
