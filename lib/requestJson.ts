export type JsonBodyError = {
  error: string;
  ok: false;
  status: 400 | 413;
};

export type JsonBodySuccess<T> = {
  ok: true;
  value: T;
};

export type JsonBodyResult<T> = JsonBodyError | JsonBodySuccess<T>;

export const defaultJsonBodyLimit = 64 * 1024;

export async function readJsonBody<T>(request: Request, maxBytes = defaultJsonBodyLimit): Promise<JsonBodyResult<T>> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { error: `JSON body must be ${maxBytes} bytes or smaller.`, ok: false, status: 413 };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { error: "A JSON body is required.", ok: false, status: 400 };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return { error: `JSON body must be ${maxBytes} bytes or smaller.`, ok: false, status: 413 };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);

  if (!text.trim()) {
    return { error: "A JSON body is required.", ok: false, status: 400 };
  }

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { error: "The request body must be a JSON object.", ok: false, status: 400 };
    }
    return { ok: true, value: value as T };
  } catch {
    return { error: "The request body must be valid JSON.", ok: false, status: 400 };
  }
}
