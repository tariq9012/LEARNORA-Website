import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/instructor/")({
  beforeLoad: () => {
    throw redirect({ to: "/instructor/dashboard" });
  },
  component: () => null,
});
