import { Link, useParams } from "react-router-dom";
import { findBySlug, newsPosts, renderMarkdown } from "../lib/content";

export function NewsPostPage() {
  const { slug = "" } = useParams();
  const post = findBySlug(newsPosts, slug);
  if (!post) {
    return (
      <section className="page">
        <p>Post not found.</p>
        <Link to="/news">Back to news</Link>
      </section>
    );
  }
  return (
    <article className="page prose">
      <Link className="back" to="/news">
        ← News
      </Link>
      {post.date ? <time dateTime={post.date}>{post.date}</time> : null}
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
    </article>
  );
}
