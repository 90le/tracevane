import {
  isUnsupportedCode,
  normalizeApiError,
  type NormalizedApiError,
} from "./normalize-error.mjs";

export { isUnsupportedCode, normalizeApiError };
export type { NormalizedApiError };

/**
 * Error thrown by the API client for any non-2xx response. Carries the
 * normalized backend code/message and an `unsupported` flag derived from the
 * code so callers can render a graceful "coming soon" state.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly unsupported: boolean;

  constructor(status: number, normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = "ApiError";
    this.status = status;
    this.code = normalized.code;
    this.unsupported = normalized.unsupported;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
