"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import type { ChatSession } from "@/lib/chat-session";
type ClientMessage = { clientMessageId: string; question: string };
import { chatErrorMessage, sendChatStream, type ChatReply, type ChatStage } from "@/lib/chat-stream";
import ChatIcon from "./chat-icon";

type Turn = { id: string; question: string; provisional: string; reply: ChatReply | null; error: string | null };
const stageLabels: Record<ChatStage, string> = {
  searching: "관련 이력을 찾고 있어요…",
  generating: "답변을 작성하고 있어요…",
  validating: "답변을 확인하고 있어요…",
};

export default function ChatConversation({ session, onNewConversation }: { session: ChatSession; onNewConversation: () => void }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [stage, setStage] = useState<ChatStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustReenter, setMustReenter] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeTurnRef = useRef<HTMLDivElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const followLatest = useRef(true);
  const hasConversation = turns.length > 0;

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (followLatest.current) {
      (activeTurnRef.current ?? endRef.current)?.scrollIntoView({ block: "end" });
    }
  }, [turns, stage, activeTurnId]);

  async function send(event?: FormEvent, retry?: ClientMessage) {
    event?.preventDefault();
    const question = retry?.question ?? draft.trim();
    if (!question || question.length > 1000 || activeRequest.current || mustReenter) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const outgoing = { clientMessageId: retry?.clientMessageId ?? crypto.randomUUID(), question };
    const id = outgoing.clientMessageId;
    const updateTurn = (change: Partial<Turn>) => setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, ...change } : turn));
    followLatest.current = true;
    setTurns((current) => {
      const pending: Turn = { id, question, provisional: "", reply: null, error: null };
      return current.some((turn) => turn.id === id)
        ? current.map((turn) => turn.id === id ? pending : turn)
        : [...current, pending];
    });
    setActiveTurnId(id);
    setDraft("");
    setBusy(true);
    setStage("searching");
    try {
      const reply = await sendChatStream({
        message: question, clientMessageId: id, csrf: session.csrf, signal: controller.signal,
        onEvent(event) {
          if (controller.signal.aborted) return;
          if (event.event === "delta") {
            setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, provisional: turn.provisional + event.text } : turn));
          } else setStage(event.event);
        },
      });
      controller.signal.throwIfAborted();
      // Only completed is authoritative, even when it replaces a provisional answer.
      updateTurn({ reply, provisional: "" });
    } catch (error) {
      updateTurn({ provisional: "", error: controller.signal.aborted ? "답변 생성을 중지했습니다." : chatErrorMessage(error) });
      setDraft(question);
      if (error instanceof ApiError && ["UNAUTHENTICATED", "INVITATION_UNAVAILABLE", "ACCESS_DENIED", "CHAT_MESSAGE_ID_CONFLICT"].includes(error.code)) {
        setMustReenter(true);
      }
    } finally {
      activeRequest.current = null;
      setBusy(false);
      setStage(null);
    }
  }

  const composer = (
    <form onSubmit={(event) => { void send(event); }} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_32px_-12px_rgba(24,24,27,0.10)] transition-shadow focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100/60 sm:p-5">
      <label className="sr-only" htmlFor="message">AI에게 보낼 메시지</label>
      <textarea ref={messageRef} id="message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={mustReenter ? "다시 입장한 후 질문할 수 있습니다" : "무엇이든 물어보세요…"} rows={hasConversation ? 2 : 3} maxLength={1000} disabled={busy || mustReenter} aria-describedby="composer-note" onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
          event.preventDefault(); void send();
        }
      }} className="block max-h-48 min-h-16 w-full resize-y border-0 bg-transparent text-base leading-7 text-zinc-800 placeholder:text-zinc-400 focus:outline-none disabled:opacity-60" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span id="composer-note" className="text-xs text-zinc-500">{busy && stage ? stageLabels[stage] : `${draft.length.toLocaleString()} / 1,000 · Shift + Enter로 줄바꿈`}</span>
        {busy ? <button key="stop" type="button" onClick={(event) => { event.preventDefault(); activeRequest.current?.abort(); }} className="rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-medium text-white hover:bg-zinc-700">생성 중지</button>
          : <button key="send" type="submit" disabled={!draft.trim() || mustReenter} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400" aria-label="메시지 전송"><ChatIcon name="arrow" /></button>}
      </div>
    </form>
  );

  return (
    <div className={`flex flex-col bg-[#f8f9fc] ${hasConversation ? "h-dvh" : "min-h-dvh"}`}>
      <header className={`flex shrink-0 items-center px-6 py-5 sm:px-10 ${hasConversation ? "justify-between border-b border-zinc-200/70" : "justify-end"}`}>
        {hasConversation && <div className="min-w-0 pr-4"><p className="text-lg font-bold text-zinc-900">이훈재</p><p className="truncate text-xs text-violet-700">{session.visitor.position}</p></div>}
        <button type="button" disabled={busy} onClick={onNewConversation} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"><ChatIcon name="plus" className="size-4" />{mustReenter ? "다시 입장" : "새 대화"}</button>
      </header>
      {hasConversation ? <>
        <main className="min-h-0 flex-1 overflow-y-auto" aria-label="대화 내용" onScroll={(event) => { const el = event.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
          <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8">
            {turns.map((turn) => <div key={turn.id} ref={turn.id === activeTurnId ? activeTurnRef : undefined} className="space-y-6">
              <div className="flex flex-col items-end"><div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-violet-100 px-5 py-3.5 text-sm leading-7 text-zinc-900"><span className="sr-only">질문: </span>{turn.question}</div></div>
              <article className="text-sm leading-7 text-zinc-700" aria-label="AI 답변" aria-busy={!turn.reply && !turn.error}>
                <p className="mb-2 text-xs font-semibold text-violet-700">이훈재의 이력에 대한 답변</p>
                {turn.error ? <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-800"><p>{turn.error}</p><p className="mt-2 text-xs text-red-700">미완료 답변은 표시하지 않습니다. 질문은 입력창에 남겨두었습니다.</p>
                  {!mustReenter && <button type="button" disabled={busy} onClick={() => { void send(undefined, { clientMessageId: turn.id, question: turn.question }); }} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"><ChatIcon name="refresh" className="size-3.5" />다시 시도</button>}
                </div>
                  : <><p className="whitespace-pre-wrap break-words">{turn.reply?.answer ?? turn.provisional}</p>
                    {!turn.reply && busy && turn.id === activeTurnId && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><ChatIcon name="loader" className="size-3.5 motion-safe:animate-spin" />{stage ? stageLabels[stage] : "대기 중…"}</p>}
                  </>}
              </article>
            </div>)}
            <div ref={endRef} />
          </div>
        </main>
        <footer className="mx-auto w-full max-w-3xl shrink-0 px-5 pb-5 pt-3 sm:px-8">{composer}<p className="mt-2 text-center text-[11px] text-zinc-500">AI가 이력 자료를 바탕으로 답변합니다. 중요한 내용은 이력서와 함께 확인해 주세요.</p></footer>
      </> : <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-12 pt-8 sm:px-8 sm:pb-20">
        <div className="mb-9 sm:mb-11">
          <h1 className="text-5xl font-bold leading-tight tracking-[-0.055em] text-zinc-900 sm:text-7xl">이훈재</h1>
          <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-violet-700 sm:text-3xl">{session.visitor.position}</p>
          <div className="mt-8 border-l-2 border-violet-200 pl-4 sm:mt-10 sm:pl-5"><p className="text-lg font-medium leading-relaxed tracking-tight text-zinc-700 sm:text-xl">이력서에 담긴 경험을 더 자세히 설명해 드립니다.</p><p className="mt-2 text-sm leading-7 text-zinc-500 sm:text-[15px]">맡았던 역할과 기술 선택의 배경, 문제를 해결한 과정까지 궁금한 내용을 질문해 주세요.</p></div>
        </div>
        {composer}
      </main>}
    </div>
  );
}
