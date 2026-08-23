import type { Metadata } from "next";
import { PropertyOnboarding } from "./property-onboarding";

export const metadata: Metadata = {
  title: "Properties",
};

export const dynamic = "force-dynamic";

export default function PropertiesPage() {
  return <PropertyOnboarding />;
}
