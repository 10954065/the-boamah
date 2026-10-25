import type { ZodError } from "zod";

/** Uniform envelope returned by every server action. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}

/** First error message per field, keyed by dotted path. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

export function fromZod(error: ZodError, message = "Please check the highlighted fields."): { ok: false; error: string; fieldErrors: Record<string, string> } {
  return { ok: false, error: message, fieldErrors: zodFieldErrors(error) };
}

/** Error thrown by guards inside server actions; converted to a failed ActionResult. */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INVALID" = "INVALID",
  ) {
    super(message);
    this.name = "ActionError";
  }
}
