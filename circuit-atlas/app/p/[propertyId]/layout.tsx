import type { ReactNode } from "react";

import { PropertyAppShell } from "./property-app-shell";

export default async function PropertyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <PropertyAppShell propertyId={propertyId}>{children}</PropertyAppShell>;
}
