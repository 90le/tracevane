export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiJson<T = unknown>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: BodyInit | Record<string, unknown> | null } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof Blob)) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    body: body as BodyInit | null | undefined,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new ApiError(`Request failed: ${response.status} ${response.statusText}`, response.status, payload);
  }
  return payload as T;
}
