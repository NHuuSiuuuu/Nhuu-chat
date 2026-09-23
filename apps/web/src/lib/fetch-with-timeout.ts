// Giữ deadline đến khi đọc xong JSON để request auth không kẹt ở header hoặc response body.
export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<{ response: Response; body: T }> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    controller.abort(new DOMException("API request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const body = await response.json() as T;
    return { response, body };
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
