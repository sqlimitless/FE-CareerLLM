import { apiGet, apiRequest, readApiJson, type CsrfToken } from "./api";
export type { CsrfToken } from "./api";

export type Invite = {
  inviteId: string;
  companyName: string;
  position: string;
  firstUsedAt: string | null;
  expiresAt: string;
  canStartConversation: boolean;
};

export type Visitor = {
  visitorId: string;
  inviteId: string;
  companyName: string;
  position: string;
  firstUsedAt: string;
  expiresAt: string;
  welcomeMessage: string;
};
export type ChatSession = { invite: Invite; visitor: Visitor; csrf: CsrfToken };

export class ChatAccessError extends Error {
  constructor(public readonly reason: "invalid" | "error") {
    super(reason);
  }
}

export function readInvitationCode(params: Pick<URLSearchParams, "getAll">): string | null {
  // Keep existing shared URLs; both short and legacy codes use the token parameter.
  const codes = params.getAll("token");
  return codes.length === 1 && codes[0].trim() ? codes[0] : null;
}

export async function prepareChatSession(code: string, signal: AbortSignal): Promise<ChatSession> {
  const response = await apiGet("/invite", signal, new URLSearchParams({ token: code }));
  if (!response.ok) {
    throw new ChatAccessError([400, 401, 403, 404, 409, 410].includes(response.status) ? "invalid" : "error");
  }
  const invite = await readApiJson(response);
  signal.throwIfAborted();
  if (!isInvite(invite)) throw new ChatAccessError("error");
  if (!invite.canStartConversation) throw new ChatAccessError("invalid");

  const entryCsrf = await getCsrf(signal);
  signal.throwIfAborted();
  const visitor = await readApiJson(await apiRequest("/api/invitations/accept", {
    signal, method: "POST", body: { token: code }, csrf: entryCsrf,
  }));
  signal.throwIfAborted();
  if (!isVisitor(visitor) || visitor.inviteId !== invite.inviteId) throw new ChatAccessError("error");
  // Accept rotates the session and invalidates the pre-entry CSRF token.
  const csrf = await getCsrf(signal);
  return { invite, visitor, csrf };
}

export function isInvite(value: unknown): value is Invite {
  if (typeof value !== "object" || value === null) return false;
  const invite = value as Record<string, unknown>;
  return typeof invite.inviteId === "string" && invite.inviteId.length > 0
    && typeof invite.companyName === "string"
    && typeof invite.position === "string"
    && (invite.firstUsedAt === null || typeof invite.firstUsedAt === "string")
    && typeof invite.expiresAt === "string"
    && typeof invite.canStartConversation === "boolean";
}

export function isCsrfToken(value: unknown): value is CsrfToken {
  if (typeof value !== "object" || value === null) return false;
  const csrf = value as Record<string, unknown>;
  return typeof csrf.headerName === "string" && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(csrf.headerName)
    && typeof csrf.token === "string" && csrf.token.trim().length > 0 && !/[\r\n]/.test(csrf.token);
}

async function getCsrf(signal: AbortSignal): Promise<CsrfToken> {
  const csrf = await readApiJson(await apiGet("/api/csrf", signal));
  signal.throwIfAborted();
  if (!isCsrfToken(csrf)) throw new ChatAccessError("error");
  return csrf;
}

function isVisitor(value: unknown): value is Visitor {
  if (typeof value !== "object" || value === null) return false;
  const visitor = value as Record<string, unknown>;
  return ["visitorId", "inviteId", "companyName", "position", "firstUsedAt", "expiresAt", "welcomeMessage"]
    .every((key) => typeof visitor[key] === "string");
}
