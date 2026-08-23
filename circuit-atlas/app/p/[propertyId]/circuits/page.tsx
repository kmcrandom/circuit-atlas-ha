import type { Metadata } from "next";

import { CircuitsClient } from "./circuits-client";

export const metadata: Metadata = { title: "Circuits" };

export default async function CircuitsPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <CircuitsClient propertyId={propertyId} />;
}
