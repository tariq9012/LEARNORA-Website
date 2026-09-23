import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { roleHomePath } from "@/lib/auth-routes";

export const Route = createFileRoute("/student")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    if (context.user.role !== "STUDENT") {
      throw redirect({ to: roleHomePath(context.user.role) });
    }
  },
  component: () => <Outlet />,
});
