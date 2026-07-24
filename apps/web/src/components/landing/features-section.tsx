"use client";

import dynamic from "next/dynamic";

const Feature1 = dynamic(() => import("../mvpblocks/feature-1"), { ssr: false });

export function FeaturesSection() {
  return <Feature1 />;
}

