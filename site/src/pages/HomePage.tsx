import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">A world under the Presence</p>
        <h1 className="brand-hero">Clara Mundi</h1>
        <p className="lede">
          Each month the Tide swells. Regions name Champions. Hold the roads, thin the blight, and keep the mother cities standing.
        </p>
        <div className="cta-row">
          <Link className="cta primary" to="/guide">
            New player guide
          </Link>
          <Link className="cta ghost" to="/status">
            Live server status
          </Link>
        </div>
      </div>
      <div className="hero-panel" aria-hidden>
        <div className="hero-glow" />
        <div className="hero-grid" />
      </div>
    </section>
  );
}
