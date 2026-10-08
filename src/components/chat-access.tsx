import ChatIcon from "./chat-icon";

type AccessProps = {
  mode: "checking" | "missing" | "invalid" | "error";
  title: string;
  description: string;
  onRetry?: () => void;
};

export default function ChatAccess({ mode, title, description, onRetry }: AccessProps) {
  const checking = mode === "checking";
  return (
    <div className="flex min-h-dvh flex-col bg-[#f8f9fc]">
      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/70 bg-white p-8 text-center shadow-[0_16px_60px_-24px_rgba(24,24,27,0.15)] sm:p-12" role="status" aria-live="polite" aria-busy={checking}>
          <div className="mx-auto mb-7 flex size-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
            <ChatIcon name={checking ? "loader" : mode === "missing" ? "link" : "alert"} className={`size-6 ${checking ? "motion-safe:animate-spin" : ""}`} />
          </div>
          <p className="mb-3 text-xs font-medium tracking-wide text-violet-600">{checking ? "대화를 준비하는 중" : "초대받은 분을 위한 공간"}</p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-zinc-500">{description}</p>
          {onRetry && <button type="button" onClick={onRetry} className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"><ChatIcon name="refresh" className="size-4" />다시 시도</button>}
        </div>
      </main>
    </div>
  );
}

export function ChatLoadingScreen() {
  return <ChatAccess mode="checking" title="잠시만 기다려 주세요" description="초대 코드를 확인하고 대화를 준비하고 있어요." />;
}
