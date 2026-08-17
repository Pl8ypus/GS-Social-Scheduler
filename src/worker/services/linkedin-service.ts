import type { Env } from "../env";
import type { Post } from "../types/post";

const CONNECTION_ID = "primary";
const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const IMAGES_URL = "https://api.linkedin.com/rest/images";
const POSTS_URL = "https://api.linkedin.com/rest/posts";
const SCOPES = ["openid", "profile", "w_member_social"];
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export type LinkedInConnectionStatus = {
  connected: boolean;
  memberUrn: string | null;
  profileName: string | null;
  scope: string | null;
  expiresAt: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
};

type LinkedInConnectionRow = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  refresh_token_expires_at: string | null;
  scope: string | null;
  member_urn: string | null;
  profile_name: string | null;
  connected_at: string;
  updated_at: string;
};

type OAuthStateRow = {
  state: string;
  redirect_uri: string;
  created_at: string;
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

type UserInfoResponse = {
  sub?: string;
  name?: string;
  localizedFirstName?: string;
  localizedLastName?: string;
};

type LinkedInErrorResponse = {
  message?: string;
  error_description?: string;
  error?: string;
};

type InitializeImageUploadResponse = {
  value?: {
    uploadUrl?: string;
    image?: string;
  };
};

function requireLinkedInConfig(env: Env): { clientId: string; clientSecret: string } {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    throw new Error("LinkedIn client id/secret are not configured");
  }

  return {
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
  };
}

function getRedirectUri(requestUrl: string, env: Env): string {
  if (env.LINKEDIN_REDIRECT_URI) {
    return env.LINKEDIN_REDIRECT_URI;
  }

  return new URL("/api/admin/linkedin/callback", requestUrl).toString();
}

function fromNowIso(seconds?: number): string | null {
  if (!seconds) return null;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now() + REFRESH_SKEW_MS;
}

function formatProfileName(userInfo: UserInfoResponse): string | null {
  if (userInfo.name) return userInfo.name;
  const name = [userInfo.localizedFirstName, userInfo.localizedLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || null;
}

function connectionStatus(row: LinkedInConnectionRow | null): LinkedInConnectionStatus {
  return {
    connected: Boolean(row),
    memberUrn: row?.member_urn ?? null,
    profileName: row?.profile_name ?? null,
    scope: row?.scope ?? null,
    expiresAt: row?.expires_at ?? null,
    connectedAt: row?.connected_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

async function getConnectionRow(db: D1Database): Promise<LinkedInConnectionRow | null> {
  return db
    .prepare(`SELECT * FROM linkedin_connections WHERE id = ?`)
    .bind(CONNECTION_ID)
    .first<LinkedInConnectionRow>();
}

async function saveConnection(
  db: D1Database,
  token: TokenResponse,
  userInfo: UserInfoResponse,
  existing?: LinkedInConnectionRow | null,
): Promise<void> {
  if (!token.access_token) {
    throw new Error("LinkedIn token response did not include an access token");
  }
  if (!userInfo.sub) {
    throw new Error("LinkedIn userinfo response did not include a member id");
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO linkedin_connections (
         id, access_token, refresh_token, expires_at, refresh_token_expires_at,
         scope, member_urn, profile_name, connected_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, linkedin_connections.refresh_token),
         expires_at = excluded.expires_at,
         refresh_token_expires_at = COALESCE(
           excluded.refresh_token_expires_at,
           linkedin_connections.refresh_token_expires_at
         ),
         scope = COALESCE(excluded.scope, linkedin_connections.scope),
         member_urn = excluded.member_urn,
         profile_name = excluded.profile_name,
         updated_at = excluded.updated_at`,
    )
    .bind(
      CONNECTION_ID,
      token.access_token,
      token.refresh_token ?? existing?.refresh_token ?? null,
      fromNowIso(token.expires_in),
      fromNowIso(token.refresh_token_expires_in) ??
        existing?.refresh_token_expires_at ??
        null,
      token.scope ?? existing?.scope ?? SCOPES.join(" "),
      `urn:li:person:${userInfo.sub}`,
      formatProfileName(userInfo),
      existing?.connected_at ?? now,
      now,
    )
    .run();
}

async function exchangeToken(
  env: Env,
  params: Record<string, string>,
): Promise<TokenResponse> {
  const { clientId, clientSecret } = requireLinkedInConfig(env);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    ...params,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error_description ?? data.error ?? "LinkedIn token request failed",
    );
  }

  return data as TokenResponse;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => ({}))) as UserInfoResponse & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message ?? "LinkedIn profile request failed");
  }

  return data;
}

export async function getLinkedInStatus(
  db: D1Database,
): Promise<LinkedInConnectionStatus> {
  return connectionStatus(await getConnectionRow(db));
}

export async function createLinkedInAuthorizationUrl(
  db: D1Database,
  env: Env,
  requestUrl: string,
): Promise<string> {
  const { clientId } = requireLinkedInConfig(env);
  const redirectUri = getRedirectUri(requestUrl, env);
  const state = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(`INSERT INTO linkedin_oauth_states (state, redirect_uri, created_at) VALUES (?, ?, ?)`)
    .bind(state, redirectUri, now)
    .run();

  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);

  return url.toString();
}

export async function completeLinkedInAuthorization(
  db: D1Database,
  env: Env,
  code: string,
  state: string,
): Promise<void> {
  const stateRow = await db
    .prepare(`SELECT * FROM linkedin_oauth_states WHERE state = ?`)
    .bind(state)
    .first<OAuthStateRow>();

  await db.prepare(`DELETE FROM linkedin_oauth_states WHERE state = ?`).bind(state).run();

  if (!stateRow) {
    throw new Error("LinkedIn authorization state is invalid or expired");
  }
  if (new Date(stateRow.created_at).getTime() < Date.now() - STATE_TTL_MS) {
    throw new Error("LinkedIn authorization state expired");
  }

  const token = await exchangeToken(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: stateRow.redirect_uri,
  });
  const userInfo = await fetchUserInfo(token.access_token);

  await saveConnection(db, token, userInfo);
}

export async function disconnectLinkedIn(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM linkedin_connections WHERE id = ?`).bind(CONNECTION_ID).run();
}

async function getUsableConnection(
  db: D1Database,
  env: Env,
): Promise<LinkedInConnectionRow> {
  let connection = await getConnectionRow(db);
  if (!connection) {
    throw new Error("LinkedIn is not connected");
  }

  if (!isExpiringSoon(connection.expires_at)) {
    return connection;
  }
  if (!connection.refresh_token) {
    throw new Error("LinkedIn access token expired; reconnect LinkedIn");
  }

  const refreshed = await exchangeToken(env, {
    grant_type: "refresh_token",
    refresh_token: connection.refresh_token,
  });
  const userInfo = await fetchUserInfo(refreshed.access_token);
  await saveConnection(db, refreshed, userInfo, connection);

  connection = await getConnectionRow(db);
  if (!connection) {
    throw new Error("LinkedIn reconnect failed");
  }
  return connection;
}

function buildCommentary(post: Post): string {
  return [post.content, post.link_url].filter(Boolean).join("\n\n");
}

function parseLinkedInPostId(response: Response): string {
  const id = response.headers.get("x-restli-id");
  if (id) return id;
  const location = response.headers.get("location");
  if (location) return location.split("/").pop() ?? location;
  return `linkedin-${crypto.randomUUID()}`;
}

function linkedInHeaders(accessToken: string, env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": env.LINKEDIN_API_VERSION ?? "202506",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function parseLinkedInError(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as LinkedInErrorResponse;
  return data.message ?? data.error_description ?? data.error ?? fallback;
}

function decodeDataImageUrl(imageUrl: string): { contentType: string; bytes: Uint8Array } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
    imageUrl,
  );
  if (!match) {
    throw new Error("LinkedIn image publishing requires a data:image base64 upload");
  }

  const contentType = match[1].toLowerCase();
  if (contentType === "image/svg+xml") {
    throw new Error("LinkedIn image publishing does not support SVG uploads");
  }

  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return { contentType, bytes };
}

async function uploadImageToLinkedIn(
  env: Env,
  accessToken: string,
  owner: string,
  imageUrl: string,
): Promise<string> {
  const image = decodeDataImageUrl(imageUrl);
  const response = await fetch(`${IMAGES_URL}?action=initializeUpload`, {
    method: "POST",
    headers: {
      ...linkedInHeaders(accessToken, env),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseLinkedInError(response, "LinkedIn image upload initialization failed"),
    );
  }

  const data = (await response.json().catch(() => ({}))) as InitializeImageUploadResponse;
  const uploadUrl = data.value?.uploadUrl;
  const imageUrn = data.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image upload initialization response was incomplete");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": image.contentType,
    },
    body: image.bytes,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      await parseLinkedInError(uploadResponse, "LinkedIn image upload failed"),
    );
  }

  return imageUrn;
}

export async function publishPostToLinkedIn(
  db: D1Database,
  env: Env,
  post: Post,
): Promise<string> {
  const connection = await getUsableConnection(db, env);
  if (!connection.member_urn) {
    throw new Error("LinkedIn profile is missing; reconnect LinkedIn");
  }

  const content = post.image_url
    ? {
        media: {
          id: await uploadImageToLinkedIn(
            env,
            connection.access_token,
            connection.member_urn,
            post.image_url,
          ),
        },
      }
    : undefined;

  const response = await fetch(POSTS_URL, {
    method: "POST",
    headers: {
      ...linkedInHeaders(connection.access_token, env),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      author: connection.member_urn,
      commentary: buildCommentary(post),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      ...(content ? { content } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseLinkedInError(response, "LinkedIn post request failed"));
  }

  return parseLinkedInPostId(response);
}
