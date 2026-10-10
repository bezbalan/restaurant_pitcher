import type { Metadata } from "next";
import RoomClient from "@/components/RoomClient";

export const metadata: Metadata = {
  title: "You're invited to Dinner Club",
  description: "Join your friends and swipe for 60 seconds to pick tonight's restaurant.",
};

export default async function RoomPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  return <RoomClient code={code.toLowerCase()} />;
}
