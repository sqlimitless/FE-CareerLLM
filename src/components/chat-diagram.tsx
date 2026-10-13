"use client";

import { useEffect, useId, useState } from "react";
import type { ChatDiagram as Diagram } from "@/lib/chat-diagram";
import { renderChatDiagram, type RenderedDiagram } from "@/lib/render-chat-diagram";

export default function ChatDiagram({ diagram }: { diagram: Diagram }) {
  const id = useId();
  const [rendered, setRendered] = useState<{ diagram: Diagram; output: RenderedDiagram } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void renderChatDiagram(diagram).then((output) => {
      if (!cancelled && output) setRendered({ diagram, output });
    });
    return () => { cancelled = true; };
  }, [diagram]);
  if (!rendered || rendered.diagram !== diagram) return null;
  return (
    <figure className="mt-5 min-w-0 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <figcaption id={`${id}-title`} className="break-words font-medium text-zinc-900">{diagram.title}</figcaption>
      <p id={`${id}-description`} className="mt-1 text-xs text-zinc-500">{diagram.illustrative ? "개념 설명용 예시" : "자료 기반 다이어그램"} · 자세한 설명은 위 답변을 참고해 주세요.</p>
      <div className="mt-3 max-w-full overflow-x-auto rounded-lg focus-visible:outline-violet-500" tabIndex={0} role="region" aria-label={`${diagram.title} 다이어그램 스크롤 영역`}>
        <iframe title={`${diagram.title} — ${diagram.illustrative ? "개념 설명용 예시" : "자료 기반 다이어그램"}`} sandbox="" referrerPolicy="no-referrer" srcDoc={rendered.output.document} className="block w-full border-0" style={{ minWidth: rendered.output.width, height: rendered.output.height }} />
      </div>
    </figure>
  );
}
