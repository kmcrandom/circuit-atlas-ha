import type { Metadata } from "next";

import { BoxClient } from "./box-client";

export const metadata: Metadata = { title: "Box Diagram" };

export default async function BoxPage({
  params,
}: {
  params: Promise<{ propertyId: string; boxId: string }>;
}) {
  const { propertyId, boxId } = await params;
  return <BoxClient boxId={boxId} propertyId={propertyId} />;
}
