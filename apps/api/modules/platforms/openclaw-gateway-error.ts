export type OpenClawGatewayErrorCode =
  | "auth_failure"
  | "duplicate_in_flight"
  | "gateway_down"
  | "internal_error"
  | "invalid_request"
  | "no_active_run"
  | "session_not_found"
  | "session_not_writable";

export interface OpenClawGatewayContractError {
  code: OpenClawGatewayErrorCode;
  message: string;
  source: "tracevane" | "gateway";
  retryable: boolean;
}

export const OPENCLAW_GATEWAY_CLOSE_CODE_MAP: Record<
  number,
  OpenClawGatewayErrorCode
> = {
  1000: "gateway_down",
  1008: "auth_failure",
};

const OPENCLAW_GATEWAY_ERROR_MESSAGE_RULES: Array<{
  pattern: RegExp;
  code: OpenClawGatewayErrorCode;
}> = [
  { pattern: /session not found/i, code: "session_not_found" },
  {
    pattern: /not writable|read-only|read only/i,
    code: "session_not_writable",
  },
  {
    pattern: /must have required property 'idempotencyKey'/i,
    code: "invalid_request",
  },
  { pattern: /no active run|no matching run/i, code: "no_active_run" },
  { pattern: /in_flight/i, code: "duplicate_in_flight" },
  {
    pattern: /gateway closed|connect failed|not connected/i,
    code: "gateway_down",
  },
];

export function buildOpenClawGatewayError(
  code: OpenClawGatewayErrorCode,
  message: string,
  source: OpenClawGatewayContractError["source"] = "tracevane",
  retryable = false,
): OpenClawGatewayContractError {
  return { code, message, source, retryable };
}

export class OpenClawGatewayServiceError extends Error {
  readonly statusCode: number;
  readonly contractError: OpenClawGatewayContractError;

  constructor(statusCode: number, contractError: OpenClawGatewayContractError) {
    super(contractError.message);
    this.statusCode = statusCode;
    this.contractError = contractError;
  }

  toShape(): { statusCode: number; error: OpenClawGatewayContractError } {
    return { statusCode: this.statusCode, error: this.contractError };
  }
}

export function isOpenClawGatewayServiceError(
  error: unknown,
): error is OpenClawGatewayServiceError {
  return error instanceof OpenClawGatewayServiceError;
}

export function mapOpenClawGatewayContractError(
  error: unknown,
  fallbackMessage: string,
): OpenClawGatewayContractError {
  const text =
    error instanceof Error ? error.message : String(error || fallbackMessage);
  for (const rule of OPENCLAW_GATEWAY_ERROR_MESSAGE_RULES) {
    if (rule.pattern.test(text)) {
      return buildOpenClawGatewayError(
        rule.code,
        text,
        "gateway",
        rule.code === "gateway_down",
      );
    }
  }
  return buildOpenClawGatewayError(
    "internal_error",
    text || fallbackMessage,
    "gateway",
    false,
  );
}
