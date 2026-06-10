"use client";

import dynamic from "next/dynamic";

const FigmaApp = dynamic(() => import("./App"), {
  ssr: false,
});

export function ClientApp() {
  return <FigmaApp />;
}
