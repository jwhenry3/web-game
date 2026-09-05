import { Link } from "react-router-dom";
import { wikiArticles } from "../lib/content";

export function WikiPage() {
  return (
    <section className="page">
      <header className="page-head">
        <h1>Wiki</h1>
        <p>Controls, regions, and the living world of Clara Mundi.</p>
      </header>
      <ul className="card-list">
        {wikiArticles.map((art) => (
          <li key={art.slug}>
            <Link to={`/wiki/${art.slug}`} className="text-card">
              <h2>{art.title}</h2>
              {art.summary ? <p>{art.summary}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
