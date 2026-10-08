export type ClientMessage = { clientMessageId: string; question: string };

// A retry belongs to the original question, not to a new HTTP attempt.
export function createClientMessage(question: string, retry?: ClientMessage | null): ClientMessage {
  const normalized = question.trim();
  if (retry && retry.question === normalized) return retry;
  return { clientMessageId: crypto.randomUUID(), question: normalized };
}
