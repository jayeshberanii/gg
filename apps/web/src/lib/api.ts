import { apiErrorSchema, type ApiError } from '@gglib/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8081/api';

/** The address of a GET the browser opens itself (a file in a new tab). */
export const apiUrl = (path: string) => `${API_URL}${path}`;

export class ApiRequestError extends Error {
  constructor(readonly body: ApiError) {
    super(body.message);
  }

  get status(): number {
    return this.body.statusCode;
  }
}

/**
 * fetch wrapper: sends the session cookie, always declares JSON (the API rejects other
 * content types on writes, as CSRF protection) and turns non-2xx responses into ApiRequestError.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    throw new ApiRequestError(
      parsed.success
        ? parsed.data
        : { statusCode: res.status, error: res.statusText, message: 'Request failed' },
    );
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown = {}) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

/** The message to show for a failed request: the API's own text, or a generic one. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Could not reach the server. Please check your connection and try again.';
}
