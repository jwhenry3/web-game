import { guideArticles, renderMarkdown } from "../lib/content";

export function GuidePage() {
  const guide = guideArticles[0];
  if (!guide) {
    return (
      <section className="page">
        <p>Guide content is missing.</p>
      </section>
    );
  }
  return (
    <article className="page prose">
      <header className="page-head">
        <h1>{guide.title}</h1>
        {guide.summary ? <p>{guide.summary}</p> : null}
      </header>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(guide.body) }} />
    </article>
  );
}
