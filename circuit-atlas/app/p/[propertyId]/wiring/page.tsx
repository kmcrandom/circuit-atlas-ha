import type { Metadata } from "next";
import { Suspense } from "react";

import { RouteFrame, RouteLoading } from "../route-ui";
import { WiringClient } from "./wiring-client";

export const metadata: Metadata = { title: "Wiring" };

export default async function WiringPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<RouteFrame><RouteLoading label="Opening wiring workspace…" /></RouteFrame>}>
      <WiringClient propertyId={propertyId} />
    </Suspense>
  );
}
