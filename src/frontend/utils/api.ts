type ApiErrorBody = {
  error?: unknown;
};

type ResponseBody = {
  data: unknown;
  isJson: boolean;
};

function getApiErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }

  const error = (body as ApiErrorBody).error;
  return typeof error === "string" && error.trim() ? error : null;
}

async function readResponseBody(response: Response): Promise<ResponseBody> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return { data: null, isJson: false };

  try {
    return { data: JSON.parse(text) as unknown, isJson: true };
  } catch {
    return { data: null, isJson: false };
  }
}

export async function parseApiResponse<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(body.data) ?? `${fallbackMessage} (${response.status})`,
    );
  }

  if (!body.isJson) {
    if (response.redirected) {
      throw new Error(`${fallbackMessage}: sign in again and retry.`);
    }
    throw new Error(`${fallbackMessage}: empty response from server.`);
  }

  return body.data as T;
}

export async function ensureApiOk(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) return;

  const body = await readResponseBody(response);
  throw new Error(
    getApiErrorMessage(body.data) ?? `${fallbackMessage} (${response.status})`,
  );
}
