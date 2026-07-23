import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="app-shell">
      <nav className="top-nav" role="navigation" aria-label="Main navigation">
        <NavLink to="/" className="top-nav__brand-link">
          <div className="top-nav__brand-mark" aria-hidden="true">
            GS
          </div>
          <div className="top-nav__brand-text">
            Greg Staunton
            <span className="top-nav__brand-sub">LinkedIn Scheduler</span>
          </div>
        </NavLink>

        <div className="top-nav__links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Home
          </NavLink>
          <NavLink
            to="/compose"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Compose
          </NavLink>
          <NavLink
            to="/calendar"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Calendar
          </NavLink>
          <NavLink
            to="/posts"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Posts
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Admin
          </NavLink>
        </div>

        <div className="top-nav__spacer" />

        <a
          className="top-nav__portal-link"
          href="https://portal.greg-staunton.com"
        >
          Client Portal
        </a>
        <a className="top-nav__logout" href="/cdn-cgi/access/logout">
          Sign out
        </a>
      </nav>

      <main className="page-wrapper">{children}</main>

      <footer className="app-footer">
        Greg Staunton &middot; LinkedIn Scheduler
      </footer>
    </div>
  );
}
