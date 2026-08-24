"use client";

import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { navigateToAppPath } from "@/lib/client";

export function HomeRedirect({ destination }: { destination: string }) {
  useEffect(() => navigateToAppPath(destination, true), [destination]);
  return <main className="onboarding-shell"><div className="center-status" role="status"><LoaderCircle className="spin" size={22} /> Opening Circuit Atlas…</div></main>;
}
