"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChatAccessError, prepareChatSession, readInvitationCode, type ChatSession as Session } from "@/lib/chat-session";

import { ApiError } from "@/lib/api";
import ChatAccess from "@/components/chat-access";

type AccessState = "checking" | "valid" | "invalid" | "error";

export default function Chat() {
  const searchParams = useSearchParams();
  const code = readInvitationCode(searchParams);
  // A URL invitation code change must discard the previous validation and draft.
  return <ChatSession key={code ?? "missing-code"} code={code} />;
}

function ChatSession({ code }: { code: string | null }) {
  const [access, setAccess] = useState<AccessState>("checking");
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!code) return;
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
        if (!controller.signal.aborted) setAccess(error instanceof ChatAccessError ? error.reason : error instanceof ApiError && ["INVITATION_UNAVAILABLE", "INVALID_INVITATION_TOKEN"].includes(error.code) ? "invalid" : "error");
      }
    }
    void verify();
    return () => controller.abort();
  }, [code, attempt]);

  if (!code || access !== "valid" || !session) {
    const title = !code
      ? "초대 링크로 접속해 주세요"
      : access === "checking"
        ? "초대 코드를 확인하고 있어요"
        : access === "invalid"
          ? "사용할 수 없는 초대 코드예요"
          : "초대 코드를 확인하지 못했어요";
    const description = !code
      ? "이력서에 첨부된 초대 링크로 접속해 주세요."
      : access === "checking"
        ? "잠시만 기다려 주세요. 초대 코드를 확인하고 대화를 준비 중입니다."
        : access === "invalid"
          ? "대화를 시작할 수 없는 초대 코드입니다. 새로운 초대 링크를 요청해 주세요."
          : "일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
    return (
      <ChatAccess
        mode={!code ? "missing" : access === "valid" ? "checking" : access}
        title={title}
        description={description}
        onRetry={code && access === "error" ? () => { setAccess("checking"); setAttempt((value) => value + 1); } : undefined}
      />
    );
  }

  return <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-8">
    <h1 className="text-5xl font-bold text-zinc-900">이훈재</h1>
    <p className="mt-3 text-2xl font-semibold text-violet-700">{session.visitor.position}</p>
    <p className="mt-8 text-lg text-zinc-700">이력서에 담긴 경험을 더 자세히 설명해 드립니다.</p>
  </main>;
}
