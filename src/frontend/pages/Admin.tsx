import { useEffect, useMemo, useState } from "react";
import { formatScheduledAt } from "../utils/datetime";

type LinkedInStatus = {
  connected: boolean;
  memberUrn: string | null;
  profileName: string | null;
  scope: string | null;
  expiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

async function fetchLinkedInStatus(): Promise<LinkedInStatus> {
  const response = await fetch("/api/admin/linkedin/status");
  const data = (await response.json()) as
    | { linkedin: LinkedInStatus }
    | { error: string };

  if (!response.ok) {
    throw new Error("error" in data ? data.error : "Failed to load LinkedIn status.");
  }

  return data.linkedin;
}

export default function Admin() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [error, setError] = useState(params.get("message") ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const linkedInResult = params.get("linkedin");

  async function loadStatus() {
    setIsLoading(true);
    try {
      setStatus(await fetchLinkedInStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin status.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function disconnect() {
    if (!window.confirm("Disconnect LinkedIn publishing?")) return;

    setIsDisconnecting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/linkedin/disconnect", {
        method: "POST",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to disconnect LinkedIn.");
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect LinkedIn.");
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Admin</p>
        <h1 className="page-title">LinkedIn API</h1>
        <p className="page-description">
          Connect the production scheduler to LinkedIn. OAuth tokens are stored in
          D1 and used by the cron publisher.
        </p>
      </header>

      <section className="card stack" aria-label="LinkedIn connection">
        <div>
          <p className="form-section-label">Connection</p>
          {isLoading && <p className="loading-state">Loading LinkedIn status…</p>}
          {!isLoading && status?.connected && (
            <div className="stack">
              <p className="alert alert-success" role="status">
                LinkedIn is connected
                {status.profileName ? ` as ${status.profileName}` : ""}.
              </p>
              <dl className="details-list">
                <div>
                  <dt>Member</dt>
                  <dd>{status.memberUrn ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Scopes</dt>
                  <dd>{status.scope ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt>Token expires</dt>
                  <dd>{formatScheduledAt(status.expiresAt)}</dd>
                </div>
                <div>
                  <dt>Connected</dt>
                  <dd>{formatScheduledAt(status.connectedAt)}</dd>
                </div>
              </dl>
            </div>
          )}
          {!isLoading && !status?.connected && (
            <p className="empty-state">
              LinkedIn is not connected. Publishing will fail until OAuth is
              completed.
            </p>
          )}
        </div>

        {linkedInResult === "connected" && (
          <p className="alert alert-success" role="status">
            LinkedIn authorization completed.
          </p>
        )}
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        <div className="btn-row">
          <a className="btn btn--primary" href="/api/admin/linkedin/authorize">
            {status?.connected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
          </a>
          {status?.connected && (
            <button
              className="btn btn--ghost"
              disabled={isDisconnecting}
              onClick={disconnect}
              type="button"
            >
              {isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
