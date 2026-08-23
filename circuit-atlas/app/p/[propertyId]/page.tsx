import { redirect } from "next/navigation";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  redirect(`/p/${encodeURIComponent(propertyId)}/map`);
}
