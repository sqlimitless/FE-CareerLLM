import type { ReactNode, SVGProps } from "react";

type IconName = "chat" | "arrow" | "refresh" | "plus" | "briefcase" | "bulb" | "question" | "link" | "alert" | "loader";

const paths: Record<IconName, ReactNode> = {
  chat: <><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" /><path d="M7 8h10M7 12h6" /></>,
  arrow: <><path d="M12 19V5m-6 6 6-6 6 6" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0M12 11v4" /></>,
  bulb: <><path d="M9 18h6M9 21h6M8.5 15.5a6 6 0 1 1 7 0c-.8.6-1 1.2-1 2.5h-5c0-1.3-.2-1.9-1-2.5Z" /></>,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" /></>,
  link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1) scale(.9)" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>,
  loader: <path d="M21 12a9 9 0 1 1-9-9" />,
};

export default function ChatIcon({ name, className = "size-5", ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
