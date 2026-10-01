import "server-only";
import { log } from "./log";

/** An error whose code and message are safe to show the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorBody = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message, ...extra },
});

/**
 * Wraps a route handler: request id, timing log, and errors turned into
 * `{ error: { code, message } }` without stack traces, paths or SQL.
 */
export function route<C>(name: string, handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const t0 = performance.now();
    try {
      const res = await handler(req, ctx);
      log("request", { route: name, method: req.method, status: res.status, ms: Math.round(performance.now() - t0), requestId });
      return res;
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      if (e instanceof ApiError) {
        log("request", { route: name, method: req.method, status: e.status, code: e.code, ms, requestId });
        return Response.json(errorBody(e.code, e.message), { status: e.status });
      }
      const err = e as { name?: string; code?: string; message?: string };
      const dbDown = err.code === "ERR_SQLITE_ERROR" || /SQLITE_(BUSY|LOCKED|CANTOPEN|FULL|IOERR)/.test(err.message ?? "");
      log("request_failed", { route: name, method: req.method, requestId, ms, error: err.name, code: err.code, detail: err.message });
      return Response.json(
        dbDown
          ? errorBody("storage_unavailable", "Your music library is unavailable right now. Try again shortly.", { requestId })
          : errorBody("internal", "Something went wrong. Try again.", { requestId }),
        { status: dbDown ? 503 : 500 },
      );
    }
  };
}

export async function readJson<T>(req: Request, maxBytes = 16 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "too_large", "Request is too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be JSON.");
  }
}
