import { Link, useParams } from "react-router-dom";
import { findBySlug, renderMarkdown, wikiArticles } from "../lib/content";

export function WikiArticlePage() {
  const { slug = "" } = useParams();
  const art = findBySlug(wikiArticles, slug);
  if (!art) {
    return (
      <section className="page">
        <p>Article not found.</p>
        <Link to="/wiki">Back to wiki</Link>
      </section>
    );
  }
  return (
    <article className="page prose">
      <Link className="back" to="/wiki">
        ← Wiki
      </Link>
      <h1>{art.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(art.body) }} />
    </article>
  );
}
