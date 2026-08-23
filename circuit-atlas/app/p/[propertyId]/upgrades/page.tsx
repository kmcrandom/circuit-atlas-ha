import type { Metadata } from "next";

import { UpgradesClient } from "./upgrades-client";

export const metadata: Metadata = { title: "Upgrade Plan" };

export default async function UpgradesPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <UpgradesClient propertyId={propertyId} />;
}
