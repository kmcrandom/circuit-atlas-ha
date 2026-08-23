export const DEVICE_DETAIL_KINDS = [
  "mac-address",
  "zigbee-ieee",
  "matter-device-id",
  "manufacturer-device-id",
  "setup-code",
  "pairing-code",
  "install-code",
  "onboarding-payload",
  "hub-bridge",
  "ecosystem-name",
  "custom",
] as const;

export type DeviceDetailKind = (typeof DEVICE_DETAIL_KINDS)[number];

export const DEVICE_DETAIL_SENSITIVITIES = ["ordinary", "identifier", "secret"] as const;
export type DeviceDetailSensitivity = (typeof DEVICE_DETAIL_SENSITIVITIES)[number];

export const DEVICE_DETAIL_VERIFICATIONS = [
  "unknown",
  "assumed",
  "inferred",
  "observed",
  "test-verified",
  "documentation-verified",
  "conflicting",
] as const;
export type DeviceDetailVerification = (typeof DEVICE_DETAIL_VERIFICATIONS)[number];

export type InstalledDeviceDetail = {
  id?: string;
  revision?: number;
  kind: DeviceDetailKind;
  label: string;
  value: string;
  sensitivity: DeviceDetailSensitivity;
  notes?: string | null;
  verification: DeviceDetailVerification;
  verifiedAt?: string | null;
  warning?: string | null;
};

export type DeviceDetailDefinition = {
  kind: DeviceDetailKind;
  label: string;
  sensitivity: DeviceDetailSensitivity;
  placeholder?: string;
};

export const DEVICE_DETAIL_DEFINITIONS: readonly DeviceDetailDefinition[] = [
  { kind: "mac-address", label: "MAC address", sensitivity: "identifier", placeholder: "AA:BB:CC:DD:EE:FF" },
  { kind: "zigbee-ieee", label: "Zigbee IEEE / EUI-64", sensitivity: "identifier", placeholder: "00:12:4B:00:12:34:56:78" },
  { kind: "matter-device-id", label: "Matter ID", sensitivity: "identifier" },
  { kind: "manufacturer-device-id", label: "Manufacturer / ecosystem device ID", sensitivity: "identifier" },
  { kind: "setup-code", label: "Setup code", sensitivity: "secret" },
  { kind: "pairing-code", label: "Pairing code", sensitivity: "secret" },
  { kind: "install-code", label: "Install code", sensitivity: "secret" },
  { kind: "onboarding-payload", label: "QR / onboarding payload", sensitivity: "secret" },
  { kind: "hub-bridge", label: "Hub / bridge", sensitivity: "ordinary" },
  { kind: "ecosystem-name", label: "Name in smart-home app", sensitivity: "ordinary" },
  { kind: "custom", label: "Custom detail", sensitivity: "identifier" },
] as const;

export function definitionForDeviceDetail(kind: DeviceDetailKind): DeviceDetailDefinition {
  return DEVICE_DETAIL_DEFINITIONS.find((item) => item.kind === kind) ?? DEVICE_DETAIL_DEFINITIONS.at(-1)!;
}

export function databaseDeviceDetailKind(kind: DeviceDetailKind) {
  return kind.replaceAll("-", "_") as
    | "mac_address" | "zigbee_ieee" | "matter_device_id" | "manufacturer_device_id"
    | "setup_code" | "pairing_code" | "install_code" | "onboarding_payload"
    | "hub_bridge" | "ecosystem_name" | "custom";
}

export function displayDeviceDetailKind(kind: string): DeviceDetailKind {
  return kind.replaceAll("_", "-") as DeviceDetailKind;
}

export function databaseDeviceDetailVerification(value: DeviceDetailVerification) {
  if (value === "observed") return "visually_observed" as const;
  return value.replaceAll("-", "_") as
    | "unknown" | "assumed" | "inferred" | "test_verified" | "documentation_verified" | "conflicting";
}

export function displayDeviceDetailVerification(value: string): DeviceDetailVerification {
  if (value === "visually_observed") return "observed";
  return value.replaceAll("_", "-") as DeviceDetailVerification;
}

function compactHex(value: string) {
  return value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

export function normalizedDeviceDetailValue(kind: DeviceDetailKind, value: string, sensitivity: DeviceDetailSensitivity) {
  if (sensitivity === "secret") return null;
  const trimmed = value.trim();
  if (kind === "mac-address" || kind === "zigbee-ieee") return compactHex(trimmed);
  return trimmed.toLocaleLowerCase();
}

export function deviceDetailFormatWarning(kind: DeviceDetailKind, value: string): string | null {
  const normalized = compactHex(value);
  if (kind === "mac-address" && normalized.length !== 12) return "A MAC address usually contains 12 hexadecimal characters.";
  if (kind === "zigbee-ieee" && normalized.length !== 16) return "A Zigbee IEEE / EUI-64 address usually contains 16 hexadecimal characters.";
  return null;
}

function includesAny(value: string, options: string[]) {
  const haystack = value.toLocaleLowerCase();
  return options.some((option) => haystack.includes(option));
}

export function suggestedDeviceDetails(manufacturer?: string | null, protocol?: string | null): DeviceDetailDefinition[] {
  const suggestions = new Set<DeviceDetailKind>();
  const vendor = manufacturer ?? "";
  const protocols = protocol ?? "";
  if (includesAny(vendor, ["hue", "signify", "philips"])) {
    ["mac-address", "setup-code", "matter-device-id", "hub-bridge", "ecosystem-name"].forEach((kind) => suggestions.add(kind as DeviceDetailKind));
  }
  if (includesAny(vendor, ["inovelli"])) {
    ["zigbee-ieee", "hub-bridge", "ecosystem-name"].forEach((kind) => suggestions.add(kind as DeviceDetailKind));
  }
  if (includesAny(protocols, ["zigbee"])) suggestions.add("zigbee-ieee");
  if (includesAny(protocols, ["matter"])) {
    suggestions.add("matter-device-id");
    suggestions.add("setup-code");
  }
  if (includesAny(protocols, ["wi-fi", "wifi", "ethernet"])) suggestions.add("mac-address");
  return DEVICE_DETAIL_DEFINITIONS.filter((item) => suggestions.has(item.kind));
}
