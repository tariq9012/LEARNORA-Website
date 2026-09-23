import { createFileRoute } from "@tanstack/react-router";

import { getCurrentUser } from "@/server/auth/guards";
import { canViewAsset } from "@/server/media/media-access-service";
import { serveAssetResponse } from "@/server/media/media-serve";

export const Route = createFileRoute("/media/public/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const user = await getCurrentUser();
        const decision = await canViewAsset(user, params.assetId);
        if (!decision.allowed) {
          return new Response(decision.reason, { status: user ? 403 : 401 });
        }
        return serveAssetResponse(params.assetId, request, { disposition: "inline" });
      },
    },
  },
});
