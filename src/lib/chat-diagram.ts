export type ChatDiagram = {
  format: "mermaid";
  title: string;
  code: string;
  illustrative: boolean;
};

export function readChatDiagram(value: unknown): ChatDiagram | null {
  if (typeof value !== "object" || value === null) return null;
  const diagram = value as Record<string, unknown>;
  if (diagram.format !== "mermaid" || typeof diagram.title !== "string" || !diagram.title.trim()
    || diagram.title.length > 120 || typeof diagram.illustrative !== "boolean"
    || typeof diagram.code !== "string" || diagram.code.length > 6000) return null;
  const code = diagram.code.trim();
  // Only these diagram types are supported. Reject configuration, HTML and links
  // before Mermaid can parse them (including directives hidden in comments).
  if (!/^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b|sequenceDiagram\b)/.test(code)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|%%\s*\{|^\s*---\s*$|<\/?[a-z][^>]*>|^\s*(?:click|links?|style|classDef|class|linkStyle)\b|@\s*\{|\b(?:href|callback|url)\s*[:(]|@import|(?:https?:|javascript:|data:|\/\/)/im.test(code)) return null;
  return { format: "mermaid", title: diagram.title, code, illustrative: diagram.illustrative };
}
