// Pure, runtime-loadable error normalizer for the web API client.
// Kept as plain .mjs so node:test can import it without a TS loader; the
// TypeScript client (./errors.ts) re-exports it.

/**
 * @typedef {{ code: string, message: string, unsupported: boolean }} NormalizedApiError
 */

/**
 * Detects whether an error code denotes an unsupported backend capability.
 * @param {string} code
 * @returns {boolean}
 */
export function isUnsupportedCode(code) {
  if (typeof code !== "string" || code.length === 0) return false;
  if (/_unsupported$/.test(code)) return true;
  if (/^model_gateway_.*_unsupported/.test(code)) return true;
  return false;
}

/**
 * Normalizes an HTTP status + parsed JSON body into a NormalizedApiError, or
 * null when the response is successful (2xx).
 *
 * Accepts both `{ error: { code, message } }` and flat `{ code, message }`.
 *
 * @param {number} status
 * @param {unknown} body
 * @returns {NormalizedApiError | null}
 */
export function normalizeApiError(status, body) {
  if (typeof status === "number" && status >= 200 && status < 300) {
    return null;
  }

  const source =
    body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object"
      ? /** @type {Record<string, unknown>} */ (body.error)
      : body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};

  const rawCode = typeof source.code === "string" && source.code ? source.code : "";
  const rawMessage = typeof source.message === "string" && source.message ? source.message : "";

  const code = rawCode || `http_${status}`;
  const message = rawMessage || `Request failed with status ${status}`;

  return {
    code,
    message,
    unsupported: isUnsupportedCode(code),
  };
}
