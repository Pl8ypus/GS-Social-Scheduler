import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Compose from "./pages/Compose";
import EditPost from "./pages/EditPost";
import Posts from "./pages/Posts";

function Home() {
  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Applied AI Build Studio</p>
        <h1 className="page-title">LinkedIn post scheduler</h1>
        <p className="page-description">
          Compose, schedule, and queue LinkedIn posts. Mock publishing runs on a
          cron until the real API is wired in.
        </p>
      </header>
      <div className="home-links">
        <Link to="/compose" className="btn btn-primary">
          Compose a post
        </Link>
        <Link to="/posts" className="btn btn-secondary">
          View posts
        </Link>
      </div>
      <div className="card home-card">
        <p className="form-section-label">What you can do</p>
        <ul className="home-card-list">
          <li>Compose drafts with optional link and image</li>
          <li>Schedule posts for a future time (UTC)</li>
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
          <Route path="/posts" element={<Posts />} />
          <Route path="/posts/:id/edit" element={<EditPost />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
