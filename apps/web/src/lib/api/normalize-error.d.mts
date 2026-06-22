export interface NormalizedApiError {
  code: string;
  message: string;
  unsupported: boolean;
}

export function isUnsupportedCode(code: string): boolean;
export function normalizeApiError(status: number, body: unknown): NormalizedApiError | null;
