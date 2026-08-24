import { AppLink } from "@/lib/client/runtime-path";
import { Cable, CircuitBoard, Lightbulb, Map, Plus } from "lucide-react";
import { getRequestIdentity } from "@/lib/auth/identity";
import { listProperties } from "@/db/repositories";
import { HomeRedirect } from "./home-redirect";

export const dynamic = "force-dynamic";

export default async function Home() {
  const properties = await listProperties(await getRequestIdentity());
  if (properties.length === 1) return <HomeRedirect destination={`/p/${encodeURIComponent(properties[0].id)}/map`} />;
  if (properties.length > 1) return <HomeRedirect destination="/properties" />;
  return (
    <main className="onboarding-shell">
      <header className="onboarding-brand">
        <span className="brand-mark" aria-hidden="true">
          <CircuitBoard size={20} strokeWidth={1.9} />
        </span>
        <span>Circuit Atlas</span>
        <span className="private-pill">Private workspace</span>
      </header>

      <section className="onboarding-hero" aria-labelledby="welcome-heading">
        <div className="eyebrow">
          <span className="eyebrow-line" />
          Your electrical system, made legible
        </div>
        <h1 id="welcome-heading">Map the house behind the walls.</h1>
        <p>
          Trace power from breaker to conductor, understand every switch and
          load, and plan smart upgrades without losing the as-built record.
        </p>
        <AppLink className="primary-action" href="/properties?new=1">
          <Plus size={18} />
          Create your first property
        </AppLink>
      </section>

      <section className="onboarding-features" aria-label="What you can map">
        <article>
          <span className="feature-icon"><CircuitBoard size={20} /></span>
          <span className="feature-number">01</span>
          <h2>Trace every circuit</h2>
          <p>Move from any breaker to its connected boxes, devices, and known conductor paths.</p>
        </article>
        <article>
          <span className="feature-icon"><Cable size={20} /></span>
          <span className="feature-number">02</span>
          <h2>See inside each box</h2>
          <p>Record cable entries, terminals, splices, travelers, pigtails, and unknown ends.</p>
        </article>
        <article>
          <span className="feature-icon"><Map size={20} /></span>
          <span className="feature-number">03</span>
          <h2>Connect it to place</h2>
          <p>Position boxes, fixtures, panels, and appliances on each floor plan.</p>
        </article>
      </section>

      <footer className="onboarding-footer">
        <span><Lightbulb size={15} /> Smart and conventional devices stay distinct.</span>
        <span>Incomplete observations are welcome.</span>
      </footer>
    </main>
  );
}
