import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishPostToLinkedIn } from "../../src/worker/services/linkedin-service";
import type { Post } from "../../src/worker/types/post";

const now = new Date().toISOString();

const post: Post = {
  id: 1,
  content: "Hello LinkedIn",
  link_url: "https://example.com",
  image_url: null,
  scheduled_at: now,
  status: "scheduled",
  linkedin_post_id: null,
  error_message: null,
  created_at: now,
};

async function insertConnection(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO linkedin_connections (
       id, access_token, refresh_token, expires_at, refresh_token_expires_at,
       scope, member_urn, profile_name, connected_at, updated_at
     )
     VALUES ('primary', 'access-token', NULL, ?, NULL, 'openid,profile,w_member_social',
       'urn:li:person:test-member', 'Test User', ?, ?)`,
  )
    .bind(
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      now,
      now,
    )
    .run();
}

describe("LinkedIn publishing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("publishes a text post", async () => {
    await insertConnection();
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:123" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(publishPostToLinkedIn(env.DB, env, post)).resolves.toBe(
      "urn:li:share:123",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.linkedin.com/rest/posts");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      author: "urn:li:person:test-member",
      commentary: "Hello LinkedIn\n\nhttps://example.com",
    });
  });

  it("uploads a data image before publishing an image post", async () => {
    await insertConnection();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          value: {
            uploadUrl: "https://www.linkedin.com/dms-uploads/test-image",
            image: "urn:li:image:test-image",
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:456" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishPostToLinkedIn(env.DB, env, {
        ...post,
        image_url: "data:image/png;base64,aGVsbG8=",
      }),
    ).resolves.toBe("urn:li:share:456");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://www.linkedin.com/dms-uploads/test-image",
    );

    const uploadInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(uploadInit.method).toBe("PUT");
    expect(uploadInit.headers).toMatchObject({ "Content-Type": "image/png" });
    expect(uploadInit.body).toBeInstanceOf(Uint8Array);

    const postInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect(JSON.parse(postInit.body as string)).toMatchObject({
      content: {
        media: {
          id: "urn:li:image:test-image",
        },
      },
    });
  });

  it("reports LinkedIn image initialization errors", async () => {
    await insertConnection();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { message: "Accessing this image resource is forbidden" },
          { status: 403 },
        ),
      ),
    );

    await expect(
      publishPostToLinkedIn(env.DB, env, {
        ...post,
        image_url: "data:image/jpeg;base64,aGVsbG8=",
      }),
    ).rejects.toThrow(
      "LinkedIn image upload initialization failed (HTTP 403): Accessing this image resource is forbidden",
    );
  });
});
