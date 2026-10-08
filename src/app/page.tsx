import { Suspense } from "react";
import Chat from "./chat";
import { ChatLoadingScreen } from "@/components/chat-access";

export default function Home() {
  return (
    <Suspense fallback={<ChatLoadingScreen />}>
      <Chat />
    </Suspense>
  );
}
