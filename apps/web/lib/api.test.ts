import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminApi, askQuestion, fetchApi, setAccessToken } from "./api";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
const replace = vi.fn();

describe("authenticated API requests", () => {
  beforeEach(() => {
    storage.clear();
    setAccessToken(null);
    replace.mockClear();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", {
      location: { pathname: "/admin/documents", replace },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears a stale session and redirects once after a 401", async () => {
    storage.setItem("access_token", "expired.jwt.token");
    storage.setItem("vibegpt_user", "{\"role\":\"admin\"}");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Invalid or expired token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(fetchApi("/api/v1/admin/semesters")).rejects.toThrow(
      "Invalid or expired token",
    );

    expect(storage.getItem("access_token")).toBeNull();
    expect(storage.getItem("vibegpt_user")).toBeNull();
    expect(storage.getItem("vibegpt_auth_error")).toBe("Invalid or expired token");
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("sends a real JWT with an upload and preserves FormData headers", async () => {
    setAccessToken("real.jwt.token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "doc-1", document_name: "notes.pdf", status: "processing" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new Blob(["%PDF-1.7 test"], { type: "application/pdf" }) as File;

    await adminApi.uploadDocument({ file, subject_id: "subject-1" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer real.jwt.token");
    expect(headers.has("Content-Type")).toBe(false);
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("never sends a demo token to the live API", async () => {
    setAccessToken("demo-token-admin");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchApi("/api/v1/admin/subjects");

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Headers).has("Authorization")).toBe(false);
  });

  it("sends multimodal attachments only through the authenticated answer API", async () => {
    setAccessToken("real.jwt.token");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "answer-1",
          status: "completed",
          answer: "A queue diagram.",
          marks: 5,
          question: "Explain this",
          subject_id: "subject-1",
          subject_name: "DSA",
          sources: [],
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await askQuestion({
      marks: 5,
      question: "Explain this",
      model: "mimo-v2.5-free",
      attachments: [
        {
          filename: "queue.png",
          mime_type: "image/png",
          data_url: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect((options.headers as Headers).get("Authorization")).toBe("Bearer real.jwt.token");
    expect(body.attachments[0].filename).toBe("queue.png");
    expect(body.attachments[0].data_url).toMatch(/^data:image\/png;base64,/);
  });
});
