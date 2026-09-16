export const DEFAULT_GREETING_DELAY_MS = 2_000;

// Tạo khoảng chờ ngắn trước lời chào tự động để tin nhắn có nhịp tự nhiên hơn.
export function waitForGreetingDelay(delayMs = DEFAULT_GREETING_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
