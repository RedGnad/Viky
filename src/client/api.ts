/** Browser-side calls to Viky's own routes: same origin, cookie included, typed refusals surfaced. */

export type ApiFailure = Readonly<{ status: number; code: string; message: string; detail?: string }>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Technical text the server sends only to one of our own accounts, never to a person using Viky. */
  readonly detail?: string;

  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = "ApiError";
    this.status = failure.status;
    this.code = failure.code;
    this.detail = failure.detail;
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(response);
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(response);
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  return unwrap<T>(response);
}

export async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "DELETE", credentials: "same-origin" });
  return unwrap<T>(response);
}

async function unwrap<T>(response: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const failure = (data ?? {}) as { error?: string; code?: string; detail?: string };
    throw new ApiError({
      status: response.status,
      code: failure.code ?? (response.status === 401 ? "SIGN_IN_REQUIRED" : "FAILED"),
      message: failure.error ?? "Something went wrong. Nothing was changed.",
      detail: failure.detail,
    });
  }
  return data as T;
}
