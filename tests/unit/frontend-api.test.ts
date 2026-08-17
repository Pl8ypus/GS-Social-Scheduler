import { describe, expect, it } from "vitest";
import { parseApiResponse } from "../../src/frontend/utils/api";

describe("frontend API response parsing", () => {
  it("uses JSON error messages for non-2xx responses", async () => {
    const response = new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
    });

    await expect(parseApiResponse(response, "Failed to load posts.")).rejects.toThrow(
      "unauthorized",
    );
  });

  it("uses a fallback message for empty non-2xx responses", async () => {
    const response = new Response(null, { status: 500 });

    await expect(parseApiResponse(response, "Failed to load posts.")).rejects.toThrow(
      "Failed to load posts. (500)",
    );
  });
});
