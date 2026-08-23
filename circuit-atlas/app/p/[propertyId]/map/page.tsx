import type { Metadata } from "next";

import { MapClient } from "./map-client";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  return <MapClient propertyId={propertyId} />;
}
