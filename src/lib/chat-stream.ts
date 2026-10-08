import { ApiError, apiRequest, readApiJson, type CsrfToken } from "./api";

export type ChatSource = { chunkId: string; documentId: string; title: string };
export type ChatReply = {
  answer: string;
  grounded: boolean;
  sources: ChatSource[];
  usage: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null } | null;
};
export type ChatStage = "searching" | "generating" | "validating";
export type ChatEvent = { event: ChatStage } | { event: "delta"; text: string };

function isReply(value: unknown): value is ChatReply {
  if (typeof value !== "object" || value === null) return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.answer === "string" && typeof reply.grounded === "boolean"
    && Array.isArray(reply.sources) && reply.sources.every((source: unknown) => {
      if (typeof source !== "object" || source === null) return false;
      const item = source as Record<string, unknown>;
      return ["chunkId", "documentId", "title"].every((key) => typeof item[key] === "string");
    });
}

export async function sendChatStream({ message, clientMessageId, csrf, signal, onEvent }: {
  message: string; clientMessageId: string; csrf: CsrfToken; signal: AbortSignal; onEvent: (event: ChatEvent) => void;
}): Promise<ChatReply> {
  const response = await apiRequest("/api/chat/messages/stream", {
    method: "POST", body: { message, clientMessageId }, csrf, signal, accept: "text/event-stream", timeoutMs: 130_000,
  });
  if (!response.ok) { await readApiJson(response); throw new ApiError("INVALID_STREAM_RESPONSE"); }
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    throw new ApiError("INVALID_STREAM_RESPONSE");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new ApiError("INVALID_STREAM_RESPONSE");
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = "message";
        const data: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        }
        if (!data.length || event === "heartbeat") continue;
        const payload: unknown = JSON.parse(data.join("\n"));
        if (event === "completed") {
          if (!isReply(payload)) throw new ApiError("INVALID_STREAM_RESPONSE");
          signal.throwIfAborted();
          return payload;
        }
        if (event === "failed") {
          const code = typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string"
            ? payload.code : "CHAT_STREAM_FAILED";
          throw new ApiError(code);
        }
        if (event === "delta") {
          if (typeof payload !== "object" || payload === null || !("text" in payload) || typeof payload.text !== "string") {
            throw new ApiError("INVALID_STREAM_RESPONSE");
          }
          onEvent({ event, text: payload.text });
        } else if (event === "searching" || event === "generating" || event === "validating") {
          onEvent({ event });
        }
      }
      if (done) throw new ApiError("CHAT_STREAM_INTERRUPTED");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function chatErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "CONNECTION_ERROR";
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "접속 세션이 종료되었습니다. 다시 입장해 주세요.",
    INVITATION_UNAVAILABLE: "초대 코드가 만료되었거나 폐기되어 이용이 종료되었습니다. 새로운 초대 링크를 요청해 주세요.",
    ACCESS_DENIED: "요청을 확인하지 못했습니다. 다시 입장한 후 질문해 주세요.",
    INVALID_REQUEST: "질문은 공백을 제외하고 1~1,000자로 입력해 주세요.",
    CHAT_MESSAGE_TOO_LONG: "질문이 처리 가능한 범위를 넘었습니다. 조금 더 짧게 작성해 주세요.",
    CHAT_BUSY: "현재 요청이 많습니다. 잠시 후 다시 질문해 주세요.",
    CHAT_REQUEST_IN_PROGRESS: "이 질문을 아직 처리 중입니다. 잠시 후 다시 시도해 주세요.",
    CHAT_MESSAGE_ID_CONFLICT: "질문 정보가 기존 요청과 일치하지 않습니다. 새 대화로 다시 시작해 주세요.",
    CHAT_MODEL_UNAVAILABLE: "답변을 생성하지 못했습니다. 잠시 후 다시 질문해 주세요.",
    KNOWLEDGE_SEARCH_UNAVAILABLE: "이력 자료를 검색하지 못했습니다. 잠시 후 다시 질문해 주세요.",
    CHAT_MEMORY_UNAVAILABLE: "대화 정보를 처리하지 못했습니다. 잠시 후 다시 질문해 주세요.",
    CHAT_STREAM_TIMEOUT: "답변 대기 시간이 초과되었습니다. 다시 질문해 주세요.",
    CHAT_STREAM_INTERRUPTED: "연결이 끊어져 답변을 완료하지 못했습니다.",
    API_NOT_CONFIGURED: "백엔드 서버 주소가 설정되지 않았습니다.",
  };
  return messages[code] ?? "답변을 완료하지 못했습니다. 연결을 확인한 후 다시 질문해 주세요.";
}
