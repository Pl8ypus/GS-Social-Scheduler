import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Admin from "./pages/Admin";
import Calendar from "./pages/Calendar";
import Compose from "./pages/Compose";
import EditPost from "./pages/EditPost";
import Posts from "./pages/Posts";
import { APP_TIME_ZONE_LABEL } from "./utils/datetime";

function Home() {
  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Greg Staunton</p>
        <h1 className="page-title">LinkedIn Scheduler</h1>
        <p className="page-description">
          Compose, schedule, and queue LinkedIn posts. Publishing runs on a cron
          through the connected LinkedIn API account.
        </p>
      </header>
      <div className="home-links">
        <Link to="/compose" className="btn btn--primary">
          Compose a post
        </Link>
        <Link to="/calendar" className="btn btn--ghost">
          View calendar
        </Link>
        <Link to="/posts" className="btn btn--ghost">
          View posts
        </Link>
        <Link to="/admin" className="btn btn--ghost">
          LinkedIn admin
        </Link>
      </div>
      <div className="card home-card">
        <p className="form-section-label">What you can do</p>
        <ul className="home-card-list">
          <li>Compose drafts with optional link and image</li>
          <li>Schedule posts for a future time ({APP_TIME_ZONE_LABEL})</li>
          <li>Track status through the publish queue</li>
        </ul>
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/posts" element={<Posts />} />
          <Route path="/posts/:id/edit" element={<EditPost />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
