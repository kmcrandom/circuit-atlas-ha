import type { Metadata } from "next";

import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Property Settings" };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <SettingsClient propertyId={propertyId} />;
}
