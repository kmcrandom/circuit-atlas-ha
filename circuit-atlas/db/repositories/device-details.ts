import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import * as dbs from "@/db/schema";
import type { RequestIdentity } from "@/lib/auth/identity";
import {
  deviceDetailFormatWarning,
  displayDeviceDetailKind,
  displayDeviceDetailVerification,
  type InstalledDeviceDetail,
} from "@/lib/device-details";
import { NotFoundError } from "@/lib/http/responses";
import { requireOwnedProperty } from "./workspaces";

export type AssetDeviceDetailGroup = {
  assetId: string;
  installedProductId: string;
  details: InstalledDeviceDetail[];
};

export async function getAssetDeviceDetails(
  identity: RequestIdentity,
  propertyId: string,
  assetId: string,
): Promise<{ groups: AssetDeviceDetailGroup[] }> {
  await requireOwnedProperty(identity, propertyId);
  const db = getDb();
  const asset = await db.query.assets.findFirst({ where: and(
    eq(dbs.assets.propertyId, propertyId),
    eq(dbs.assets.id, assetId),
    ne(dbs.assets.lifecycleState, "archived"),
  ) });
  if (!asset) throw new NotFoundError("Asset not found.");

  const childLights = asset.kind === "fixture"
    ? await db.select({ assetId: dbs.lightSources.assetId }).from(dbs.lightSources).where(and(
        eq(dbs.lightSources.propertyId, propertyId),
        eq(dbs.lightSources.fixtureAssetId, assetId),
      ))
    : [];
  const assetIds = [assetId, ...childLights.map((row) => row.assetId)];
  const products = await db.select().from(dbs.installedProducts).where(and(
    eq(dbs.installedProducts.propertyId, propertyId),
    inArray(dbs.installedProducts.assetId, assetIds),
    ne(dbs.installedProducts.lifecycleState, "archived"),
  ));
  if (!products.length) return { groups: [] };
  const details = await db.select().from(dbs.installedDeviceDetails).where(and(
    eq(dbs.installedDeviceDetails.propertyId, propertyId),
    inArray(dbs.installedDeviceDetails.installedProductId, products.map((row) => row.id)),
    ne(dbs.installedDeviceDetails.lifecycleState, "archived"),
  ));
  const normalizedValues = [...new Set(details.flatMap((detail) => detail.normalizedValue ? [detail.normalizedValue] : []))];
  const matchingIdentifiers = normalizedValues.length
    ? await db.select({ normalizedValue: dbs.installedDeviceDetails.normalizedValue }).from(dbs.installedDeviceDetails).innerJoin(
        dbs.installedProducts,
        and(
          eq(dbs.installedProducts.propertyId, dbs.installedDeviceDetails.propertyId),
          eq(dbs.installedProducts.id, dbs.installedDeviceDetails.installedProductId),
        ),
      ).where(and(
        eq(dbs.installedDeviceDetails.propertyId, propertyId),
        inArray(dbs.installedDeviceDetails.normalizedValue, normalizedValues),
        ne(dbs.installedDeviceDetails.sensitivity, "secret"),
        ne(dbs.installedDeviceDetails.lifecycleState, "archived"),
        ne(dbs.installedProducts.lifecycleState, "archived"),
      ))
    : [];
  const identifierCounts = new Map<string, number>();
  matchingIdentifiers.forEach((row) => {
    if (row.normalizedValue) identifierCounts.set(row.normalizedValue, (identifierCounts.get(row.normalizedValue) ?? 0) + 1);
  });
  return {
    groups: products.map((product) => ({
      assetId: product.assetId,
      installedProductId: product.id,
      details: details.filter((detail) => detail.installedProductId === product.id).map((detail) => {
        const kind = displayDeviceDetailKind(detail.kind);
        return {
          id: detail.id,
          revision: detail.revision,
          kind,
          label: detail.label,
          value: detail.value,
          sensitivity: detail.sensitivity,
          notes: detail.notes,
          verification: displayDeviceDetailVerification(detail.verificationState),
          verifiedAt: detail.verifiedAt,
          warning: deviceDetailFormatWarning(kind, detail.value) ?? (
            detail.normalizedValue && (identifierCounts.get(detail.normalizedValue) ?? 0) > 1
              ? "This identifier is also recorded on another active device in this property."
              : null
          ),
        };
      }),
    })),
  };
}
