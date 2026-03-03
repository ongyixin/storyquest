import { Metadata } from "next";
import { SessionView } from "@/components/SessionView";

export const metadata: Metadata = {
  title: "Reading — StoryQuest",
};

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionView sessionId={id} />;
}
