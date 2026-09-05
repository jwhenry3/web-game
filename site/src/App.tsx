import { NavLink, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { StatusPage } from "./pages/StatusPage";
import { NewsPage } from "./pages/NewsPage";
import { NewsPostPage } from "./pages/NewsPostPage";
import { WikiPage } from "./pages/WikiPage";
import { WikiArticlePage } from "./pages/WikiArticlePage";
import { GuidePage } from "./pages/GuidePage";

const nav = [
  { to: "/", label: "Home", end: true },
  { to: "/status", label: "Status" },
  { to: "/news", label: "News" },
  { to: "/wiki", label: "Wiki" },
  { to: "/guide", label: "Guide" },
];

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand-mark" end>
          Clara Mundi
        </NavLink>
        <nav className="nav" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:slug" element={<NewsPostPage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/wiki/:slug" element={<WikiArticlePage />} />
          <Route path="/guide" element={<GuidePage />} />
        </Routes>
      </main>
      <footer className="footer">
        <p>Clara Mundi — Champions hold the line when the Presence rises.</p>
      </footer>
    </div>
  );
}
