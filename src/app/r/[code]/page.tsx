import type { Metadata } from "next";
import RoomClient from "@/components/RoomClient";

export const metadata: Metadata = {
  title: "You're invited to Bite Club",
  description: "Join your friends and swipe for 60 seconds to pick where you're eating.",
};

export default async function RoomPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  return <RoomClient code={code.toLowerCase()} />;
}
