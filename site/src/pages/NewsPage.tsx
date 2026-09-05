import { Link } from "react-router-dom";
import { newsPosts } from "../lib/content";

export function NewsPage() {
  return (
    <section className="page">
      <header className="page-head">
        <h1>News</h1>
        <p>Patch notes, world events, and Champion briefings.</p>
      </header>
      <ul className="card-list">
        {newsPosts.map((post) => (
          <li key={post.slug}>
            <Link to={`/news/${post.slug}`} className="text-card">
              {post.date ? <time dateTime={post.date}>{post.date}</time> : null}
              <h2>{post.title}</h2>
              {post.summary ? <p>{post.summary}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
