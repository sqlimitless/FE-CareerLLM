export const API_VERSION = "0.1.0";
export type CsrfToken = { headerName: string; token: string };

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status = 0) {
    super(code);
  }
}

export function apiRequest(path: string, options: {
  signal: AbortSignal;
  method?: "GET" | "POST";
  params?: URLSearchParams;
  body?: unknown;
  csrf?: CsrfToken;
  accept?: string;
  timeoutMs?: number;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!baseUrl) throw new ApiError("API_NOT_CONFIGURED");
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
  if (!["http:", "https:"].includes(url.protocol)) throw new ApiError("INVALID_API_URL");
  if (options.params) url.search = options.params.toString();
  const headers = new Headers({ "API-Version": API_VERSION, Accept: options.accept ?? "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrf) headers.set(options.csrf.headerName, options.csrf.token);
  return fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 10_000)]),
  });
}

export function apiGet(path: string, signal: AbortSignal, params?: URLSearchParams) {
  return apiRequest(path, { signal, params });
}

export async function readApiJson(response: Response): Promise<unknown> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string"
      ? data.code : `HTTP_${response.status}`;
    throw new ApiError(code, response.status);
  }
  if (data === null) throw new ApiError("INVALID_API_RESPONSE");
  return data;
}
