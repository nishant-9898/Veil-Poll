"use client";

import dynamic from "next/dynamic";

const DeployClient = dynamic(() => import("./deploy-client"), { ssr: false });

export default function DeployPage() {
  return <DeployClient />;
}
