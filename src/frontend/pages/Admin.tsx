import { FormEvent, useEffect, useMemo, useState } from "react";
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

type LinkedInCredentialsStatus = {
  configured: boolean;
  clientId: string | null;
  hasStoredSecret: boolean;
  source: "database" | "environment" | null;
  updatedAt: string | null;
};

type AdminStatusResponse = {
  linkedin: LinkedInStatus;
  credentials: LinkedInCredentialsStatus;
};

async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  const response = await fetch("/api/admin/linkedin/status");

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load admin status (${response.status})`);
  }

  const data = (await response.json()) as AdminStatusResponse;
  return data;
}

export default function Admin() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [credentials, setCredentials] = useState<LinkedInCredentialsStatus | null>(
    null,
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState(params.get("message") ?? "");
  const [credentialsMessage, setCredentialsMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const linkedInResult = params.get("linkedin");

  async function loadStatus() {
    setIsLoading(true);
    try {
      const data = await fetchAdminStatus();
      setStatus(data.linkedin);
      setCredentials(data.credentials);
      setClientId(data.credentials.clientId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin status.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingCredentials(true);
    setError("");
    setCredentialsMessage("");

    try {
      const response = await fetch("/api/admin/linkedin/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret.trim() ? clientSecret : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to save credentials (${response.status})`);
      }

      const data = (await response.json()) as
        | { credentials: LinkedInCredentialsStatus; error?: string }
        | { error: string };

      setCredentials(data.credentials);
      setClientId(data.credentials.clientId ?? "");
      setClientSecret("");
      setCredentialsMessage("LinkedIn API credentials saved securely.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save LinkedIn credentials.",
      );
    } finally {
      setIsSavingCredentials(false);
    }
  }

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

  const credentialsHint = credentials?.configured
    ? credentials.source === "environment"
      ? "Currently loaded from Worker environment variables. Saving here stores them encrypted in D1 instead."
      : "Client secret is stored encrypted and is never shown again after saving."
    : "Add the Client ID and Client Secret from your LinkedIn Developer app.";

  return (
    <>
      <header className="page-header">
        <p className="page-eyebrow">Admin</p>
        <h1 className="page-title">LinkedIn API</h1>
        <p className="page-description">
          Configure LinkedIn OAuth credentials and connect the scheduler to your
          profile. Credentials are encrypted at rest; only the Client ID is shown
          after saving.
        </p>
      </header>

      <section className="card stack" aria-label="LinkedIn API credentials">
        <div>
          <p className="form-section-label">API credentials</p>
          <p className="page-description">{credentialsHint}</p>
        </div>

        {isLoading && <p className="loading-state">Loading credentials…</p>}

        {!isLoading && (
          <form className="stack" onSubmit={saveCredentials}>
            <div className="field">
              <label htmlFor="linkedin_client_id" className="field-label">
                Client ID
              </label>
              <input
                id="linkedin_client_id"
                className="field-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="linkedin_client_secret" className="field-label">
                Client secret
              </label>
              <input
                id="linkedin_client_secret"
                className="field-input"
                type="password"
                autoComplete="new-password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={
                  credentials?.hasStoredSecret
                    ? "Leave blank to keep the saved secret"
                    : "Required"
                }
                required={!credentials?.hasStoredSecret}
              />
            </div>

            {credentials?.configured && credentials.updatedAt && (
              <p className="empty-state">
                Last updated {formatScheduledAt(credentials.updatedAt)}.
              </p>
            )}

            {credentialsMessage && (
              <p className="alert alert-success" role="status">
                {credentialsMessage}
              </p>
            )}

            <div className="btn-row">
              <button
                className="btn btn--primary"
                disabled={isSavingCredentials}
                type="submit"
              >
                {isSavingCredentials ? "Saving…" : "Save credentials"}
              </button>
            </div>
          </form>
        )}
      </section>

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
              LinkedIn is not connected. Save credentials above, then connect to
              enable publishing.
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
          {credentials?.configured ? (
            <a className="btn btn--primary" href="/api/admin/linkedin/authorize">
              {status?.connected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
            </a>
          ) : (
            <button className="btn btn--primary" disabled type="button">
              Connect LinkedIn
            </button>
          )}
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
