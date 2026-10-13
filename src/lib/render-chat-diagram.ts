import { readChatDiagram, type ChatDiagram } from "./chat-diagram";

export type RenderedDiagram = { document: string; width: number; height: number };
let nextId = 0;
let pending: Promise<unknown> = Promise.resolve();

export function renderChatDiagram(diagram: ChatDiagram): Promise<RenderedDiagram | null> {
  // Mermaid has global state. Serialize rendering so concurrent replies cannot
  // change each other's configuration or temporary DOM.
  const task = pending.then(() => render(diagram)).catch(() => null);
  pending = task;
  return task;
}

async function render(diagram: ChatDiagram): Promise<RenderedDiagram | null> {
  const safe = readChatDiagram(diagram);
  if (!safe) return null;
  const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([
    import("mermaid"), import("dompurify"),
  ]);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    maxTextSize: 6000,
    maxEdges: 150,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    theme: "neutral",
  });
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:1000px;visibility:hidden;pointer-events:none";
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  try {
    await mermaid.parse(safe.code);
    const { svg } = await mermaid.render(`chat-diagram-${++nextId}`, safe.code, host);
    // Never bind Mermaid callbacks. Strip active elements, HTML, links and images.
    const clean = DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ["style"],
      FORBID_TAGS: ["foreignObject", "a", "image", "script", "iframe", "use", "animate", "set"],
      FORBID_ATTR: ["href", "xlink:href"],
    });
    const parsed = new DOMParser().parseFromString(clean, "image/svg+xml");
    const root = parsed.documentElement;
    if (root.localName !== "svg" || parsed.querySelector("parsererror")) return null;
    const box = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) return null;
    const width = Math.min(1200, Math.max(280, box[2]));
    const height = Math.min(900, Math.max(120, width * box[3] / box[2] + 24));
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", safe.title);
    root.removeAttribute("style");
    root.setAttribute("width", "100%");
    root.removeAttribute("height");
    const markup = new XMLSerializer().serializeToString(root);
    // The final SVG lives in a scriptless, opaque-origin iframe with all network
    // access disabled, so diagram CSS cannot affect the chat or fetch resources.
    return {
      width, height,
      document: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{margin:0;padding:12px;box-sizing:border-box}svg{display:block;width:100%;height:auto}*{box-sizing:border-box}</style></head><body>${markup}</body></html>`,
    };
  } finally {
    host.remove();
  }
}
