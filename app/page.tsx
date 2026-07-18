"use client";

import dynamic from "next/dynamic";

const PollApp = dynamic(() => import("./poll-app"), { ssr: false });

export default function Home() {
  return <PollApp />;
}
