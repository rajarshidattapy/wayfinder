interface Window {
  count: number;
  resetAt: number;
}

// In-memory sliding window per user. Resets each minute.
// A buggy content script that loops WF_NEXT_STEP will drain Cerebras quota in seconds — this caps it.
const windows = new Map<string, Window>();

export function checkRateLimit(
  userId: string,
  { max = 30, windowMs = 60_000 }: { max?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();

  let w = windows.get(userId);
  if (!w || now > w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(userId, w);
  }

  w.count++;
  const allowed = w.count <= max;
  const remaining = Math.max(0, max - w.count);
  const resetIn = Math.ceil((w.resetAt - now) / 1000);

  return { allowed, remaining, resetIn };
}
