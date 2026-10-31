import { createFileRoute, redirect } from "@tanstack/react-router";
import { homeRouteFor } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (!context.auth.user) throw redirect({ to: "/login" });
    throw redirect({ to: homeRouteFor(context.auth.role) });
  },
});
