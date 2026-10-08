export type ClientMessage = { clientMessageId: string; question: string };

// A retry belongs to the original question, not to a new HTTP attempt.
export function createClientMessage(question: string, retry?: ClientMessage | null): ClientMessage {
  const normalized = question.trim();
  if (retry && retry.question === normalized) return retry;
  return { clientMessageId: createMessageId(), question: normalized };
}

function createMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // HTTP on a LAN IP is not a secure context; getRandomValues remains available.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
