import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand-block">
            <NavLink to="/" className="app-brand">
              <span className="app-brand-dot" aria-hidden="true" />
              pl8ypus
            </NavLink>
            <span className="app-brand-sub">LinkedIn Scheduler</span>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
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
              to="/posts"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              Posts
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
