type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Reports an error from the client.
 *
 * In development this logs a structured message to the console so the
 * failure is easy to spot. In production this is the single place to wire
 * up a real error-monitoring provider (e.g. Sentry) later — swap the body
 * of this function without touching any of its call sites.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const payload = {
    message,
    ...(stack !== undefined && { stack }),
    route: window.location.pathname,
    mechanism: options.mechanism ?? "manual",
    handled: options.handled ?? true,
    severity: options.severity ?? "error",
    ...context,
  };

  if (import.meta.env.DEV) {
    console.error("[error-reporting]", payload);
    return;
  }

  // Production: no error-monitoring provider is connected yet. Errors are
  // still logged so they show up in server/console logs; connect a provider
  // such as Sentry here when one is actually needed.
  console.error(payload);
}
