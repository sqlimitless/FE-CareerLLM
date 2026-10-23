"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatAccessError, prepareChatSession, readInvitationCode, type ChatSession as Session } from "@/lib/chat-session";

import ChatConversation from "@/components/chat-conversation";
import { ApiError } from "@/lib/api";
import ChatAccess from "@/components/chat-access";

type AccessState = "checking" | "valid" | "invalid" | "ended" | "error" | "closed";

export default function Chat() {
  const searchParams = useSearchParams();
  // Only a genuinely absent code enters as a guest. Malformed invitation links
  // remain invalid rather than silently falling back to public access.
  const code = searchParams.has("token") ? readInvitationCode(searchParams) ?? "" : null;
  return <InvitationChat code={code} />;
}

export function InvitationChat({ code }: { code: string | null }) {
  // A URL invitation code change must discard the previous validation and draft.
  return <ChatSession key={JSON.stringify(code)} code={code} />;
}

function ChatSession({ code }: { code: string | null }) {
  const [access, setAccess] = useState<AccessState>("checking");
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const invitationCode = code;
    const controller = new AbortController();
    async function verify() {
      try {
        const preparedSession = await prepareChatSession(invitationCode, controller.signal);
        if (controller.signal.aborted) return;
        // Retain the returned header name and token in memory for chat requests.
        setSession(preparedSession);
        setAccess("valid");
      } catch (error) {
        if (!controller.signal.aborted) {
          setAccess(error instanceof ApiError && error.code === "GUEST_ACCESS_DISABLED" ? "closed"
            : error instanceof ChatAccessError ? error.reason
            : error instanceof ApiError && ["INVITATION_UNAVAILABLE", "INVALID_INVITATION_TOKEN"].includes(error.code) ? "invalid" : "error");
        }
      }
    }
    void verify();
    return () => controller.abort();
  }, [code, attempt]);

  if (access !== "valid" || !session) {
    const title = access === "closed"
      ? "초대 링크로 접속해 주세요"
      : access === "ended"
        ? "대화 이용이 종료되었습니다"
      : access === "checking"
        ? code === null ? "대화를 준비하고 있어요" : "초대 코드를 확인하고 있어요"
        : access === "invalid"
          ? code === null ? "지금은 대화를 이용할 수 없습니다" : "사용할 수 없는 초대 코드예요"
          : code === null ? "대화를 준비하지 못했어요" : "초대 코드를 확인하지 못했어요";
    const description = access === "ended"
        ? code === null ? "지금은 대화를 이용할 수 없습니다. 나중에 다시 접속해 주세요." : "초대 코드가 만료되었거나 폐기되었습니다. 새로운 초대 링크를 요청해 주세요."
      : access === "checking"
        ? "잠시만 기다려 주세요. 대화를 준비 중입니다."
        : access === "invalid"
          ? code === null ? "나중에 다시 접속해 주세요." : "대화를 시작할 수 없는 초대 코드입니다. 새로운 초대 링크를 요청해 주세요."
          : "일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    return (
      <ChatAccess
        mode={access === "valid" ? "checking" : access === "ended" ? "invalid" : access}
        title={title}
        description={description}
        onRetry={access === "error" ? () => { setAccess("checking"); setAttempt((value) => value + 1); } : undefined}
      />
    );
  }

  return <ChatConversation session={session} onAccessEnded={(reason) => { setAccess(reason === "guest-disabled" ? "closed" : "ended"); }} onNewConversation={() => {
    setSession(null);
    setAccess("checking");
    setAttempt((value) => value + 1);
  }} />;
}
