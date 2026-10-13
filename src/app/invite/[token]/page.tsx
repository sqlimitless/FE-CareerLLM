import { Suspense } from "react";
import { InvitationChat } from "@/app/chat";
import { ChatLoadingScreen } from "@/components/chat-access";

type InvitePageProps = { params: Promise<{ token: string }> };

export default function InvitePage({ params }: InvitePageProps) {
  return (
    <Suspense fallback={<ChatLoadingScreen />}>
      <InviteContent params={params} />
    </Suspense>
  );
}

async function InviteContent({ params }: InvitePageProps) {
  const { token } = await params;
  return <InvitationChat code={token.trim() ? token : null} />;
}
