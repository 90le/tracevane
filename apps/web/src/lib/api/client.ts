import { resolveApiUrl } from "../runtime";
import { ApiError, normalizeApiError } from "./errors";

export interface ApiRequestOptions extends RequestInit {
  signal?: AbortSignal;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Performs a JSON API request against a backend path (e.g. `/api/...`; the dev
 * server proxies these to the backend). Same-origin absolute paths are routed
 * through {@link resolveApiUrl} so gateway mode prefixes them with the
 * injected `apiBasePath`; full URLs pass through untouched. On a non-2xx
 * response it throws a normalized {@link ApiError}. Passes through an optional
 * `AbortSignal`.
 */
export async function apiRequest<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (
    init.body != null &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(resolveApiUrl(path), { ...init, headers });
  const body = await parseBody(response);

  const normalized = normalizeApiError(response.status, body);
  if (normalized) {
    throw new ApiError(response.status, normalized);
  }

  return body as T;
}
