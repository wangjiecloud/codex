"use client";

import dynamic from "next/dynamic";

const IndustryDetailContent = dynamic(() => import("./IndustryDetailContent"), {
  ssr: false,
  loading: () => null,
});

export default function IndustryDetailPage() {
  return <IndustryDetailContent />;
}
