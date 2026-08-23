import type { Metadata } from "next";
import { Suspense } from "react";

import { RouteFrame, RouteLoading } from "../../route-ui";
import { CaptureClient } from "./capture-client";

export const metadata: Metadata = { title: "Room-walk Capture" };

export default async function CapturePage({ params }: { params: Promise<{ propertyId: string; draftId: string }> }) {
  const { propertyId, draftId } = await params;
  return (
    <Suspense fallback={<RouteFrame><RouteLoading label="Opening room-walk capture…" /></RouteFrame>}>
      <CaptureClient draftId={draftId} propertyId={propertyId} />
    </Suspense>
  );
}
