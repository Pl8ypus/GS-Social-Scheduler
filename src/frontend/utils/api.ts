type ApiErrorBody = {
  error?: unknown;
};

function getApiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }

  const error = (body as ApiErrorBody).error;
  return typeof error === "string" && error.trim() ? error : null;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function parseApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(body) ?? `${fallbackMessage} (${response.status})`,
    );
  }

  if (body === null) {
    throw new Error(`${fallbackMessage}: empty response from server.`);
  }

  return body as T;
}

export async function ensureApiOk(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) return;

  const body = await readResponseBody(response);
  throw new Error(
    getApiErrorMessage(body) ?? `${fallbackMessage} (${response.status})`,
  );
}
