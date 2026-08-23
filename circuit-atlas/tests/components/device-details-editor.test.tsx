import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceDetailsEditor } from "@/features/inventory/DeviceDetailsEditor";
import type { InstalledDeviceDetail } from "@/lib/device-details";

afterEach(cleanup);

describe("DeviceDetailsEditor", () => {
  it("suggests Hue commissioning fields and keeps setup codes masked", () => {
    const onChange = vi.fn();
    const details: InstalledDeviceDetail[] = [{
      kind: "setup-code",
      label: "Hue setup code",
      value: "111-22-333",
      sensitivity: "secret",
      verification: "observed",
    }];
    render(<DeviceDetailsEditor details={details} manufacturer="Philips Hue" protocol="Matter" onChange={onChange} />);

    expect(screen.getByRole("button", { name: /add mac address/i })).toBeVisible();
    const input = screen.getByLabelText("Hue setup code exact value");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Reveal Hue setup code" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("suggests the Zigbee IEEE field for an Inovelli switch", () => {
    const onChange = vi.fn();
    render(<DeviceDetailsEditor details={[]} manufacturer="Inovelli" protocol="Zigbee" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add zigbee ieee/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "zigbee-ieee", sensitivity: "identifier" }),
    ]);
  });

  it("allows a vendor-neutral custom secret", () => {
    const onChange = vi.fn();
    render(<DeviceDetailsEditor details={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add custom detail/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "custom", label: "Custom detail" }),
    ]);
  });
});
