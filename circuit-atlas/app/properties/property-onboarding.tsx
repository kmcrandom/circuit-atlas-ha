"use client";

import { useEffect, useId, useState } from "react";
import { AppLink } from "@/lib/client/runtime-path";
import { navigateToAppPath, withRuntimeBasePath } from "@/lib/client";
import {
  ArrowRight,
  Building2,
  CircuitBoard,
  LoaderCircle,
  Plus,
  RotateCcw,
} from "lucide-react";

type PropertySummary = {
  id: string;
  permanentCode: string;
  name: string;
  address: string | null;
  counts: {
    panels: number;
    assets: number;
    circuits: number;
  };
  updatedAt: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; properties: PropertySummary[] }
  | { kind: "error"; message: string };

export function PropertyOnboarding() {
  const nameId = useId();
  const addressId = useId();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadProperties() {
    setState({ kind: "loading" });
    try {
      const response = await fetch(withRuntimeBasePath("/api/properties"), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Properties could not be loaded.");
      const body = (await response.json()) as { items: PropertySummary[] };
      setState({ kind: "ready", properties: body.items });
      if (body.items.length === 0) setShowForm(true);
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Properties could not be loaded.",
      });
    }
  }

  useEffect(() => {
    void loadProperties();
  }, []);

  async function createProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a name for this property.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const response = await fetch(withRuntimeBasePath("/api/properties"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
        }),
      });
      const body = (await response.json()) as
        | { property: PropertySummary }
        | { error?: { message?: string } };
      if (!response.ok || !("property" in body)) {
        throw new Error(
          "error" in body && body.error?.message
            ? body.error.message
            : "The property could not be created.",
        );
      }
      navigateToAppPath(`/p/${encodeURIComponent(body.property.id)}/map`);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "The property could not be created.",
      );
      setIsSaving(false);
    }
  }

  return (
    <main className="property-page">
      <header className="property-page-header">
        <AppLink className="onboarding-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <CircuitBoard size={20} strokeWidth={1.9} />
          </span>
          <span>Circuit Atlas</span>
        </AppLink>
        <span className="private-pill">Private workspace</span>
      </header>

      <section className="property-page-intro">
        <div>
          <span className="eyebrow">Properties</span>
          <h1>Choose a house to map.</h1>
          <p>Each property keeps its rooms, panels, wiring, plans, and history completely separate.</p>
        </div>
        {state.kind === "ready" && state.properties.length > 0 ? (
          <button className="primary-button" onClick={() => setShowForm((value) => !value)} type="button">
            <Plus size={17} /> Add property
          </button>
        ) : null}
      </section>

      {state.kind === "loading" ? (
        <div className="center-status" role="status">
          <LoaderCircle className="spin" size={22} /> Loading properties…
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="error-panel" role="alert">
          <strong>Couldn’t open the workspace</strong>
          <p>{state.message}</p>
          <button className="secondary-button" onClick={() => void loadProperties()} type="button">
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      ) : null}

      {state.kind === "ready" && state.properties.length > 0 ? (
        <section className="property-grid" aria-label="Properties">
          {state.properties.map((property) => (
            <AppLink className="property-card" href={`/p/${property.id}/map`} key={property.id}>
              <span className="property-card-icon"><Building2 size={21} /></span>
              <span className="property-code">{property.permanentCode}</span>
              <h2>{property.name}</h2>
              <p>{property.address ?? "No address recorded"}</p>
              <dl>
                <div><dt>Panels</dt><dd>{property.counts.panels}</dd></div>
                <div><dt>Circuits</dt><dd>{property.counts.circuits}</dd></div>
                <div><dt>Assets</dt><dd>{property.counts.assets}</dd></div>
              </dl>
              <span className="property-card-open">Open atlas <ArrowRight size={16} /></span>
            </AppLink>
          ))}
        </section>
      ) : null}

      {showForm && state.kind !== "loading" ? (
        <section className="new-property-card" aria-labelledby="new-property-heading">
          <div className="new-property-copy">
            <span className="feature-icon"><Building2 size={21} /></span>
            <h2 id="new-property-heading">New property</h2>
            <p>Start with a name. Floors, rooms, panels, and every electrical detail are added as data afterward.</p>
          </div>
          <form onSubmit={createProperty}>
            <div className="form-field">
              <label htmlFor={nameId}>Property name</label>
              <input
                autoComplete="off"
                autoFocus
                disabled={isSaving}
                id={nameId}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Primary residence"
                value={name}
              />
            </div>
            <div className="form-field">
              <label htmlFor={addressId}>Address <span>Optional</span></label>
              <input
                autoComplete="street-address"
                disabled={isSaving}
                id={addressId}
                maxLength={240}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Stored privately"
                value={address}
              />
            </div>
            {formError ? <p className="form-error" role="alert">{formError}</p> : null}
            <div className="form-actions">
              {state.kind === "ready" && state.properties.length > 0 ? (
                <button className="text-button" disabled={isSaving} onClick={() => setShowForm(false)} type="button">Cancel</button>
              ) : null}
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                {isSaving ? "Creating…" : "Create property"}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
