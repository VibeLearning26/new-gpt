/**
 * VibeGPT – Cloudflare Worker API Gateway
 *
 * Public entry point for all VibeGPT API traffic. Sits in front of the
 * FastAPI origin (Oracle VPS, reached through a Cloudflare Tunnel) and:
 *
 *   - verifies that protected routes carry a bearer token (FastAPI still
 *     performs full JWT validation and role checks — defense in depth),
 *   - rate limits each client (per token, else per IP) at the edge,
 *   - injects the shared origin token the origin reverse proxy requires,
 *     stripping any client-supplied attempt to spoof it,
 *   - enforces a request-body cap before traffic reaches the origin,
 *   - applies security headers + no-store caching to API responses,
 *   - emits structured audit logs for 401/403/429 events (`wrangler tail`).
 *
 * The Worker is deployed on a route `YOUR_DOMAIN/api/*` while the Next.js
 * frontend lives on Cloudflare Pages under the same domain, so the browser
 * sees everything same-origin and the refresh cookie (SameSite=Lax) works
 * unchanged. Set ALLOWED_ORIGINS / FORCE_SAMESITE_NONE only for the
 * cross-origin fallback (pages.dev → workers.dev) documented in DEPLOYMENT.md.
 */

export interface Env {
  /** Base URL of the FastAPI origin, e.g. https://origin.example.com */
  ORIGIN_URL: string;
  /** Shared secret also configured on the origin reverse proxy. */
  ORIGIN_TOKEN?: string;
  /** Rate Limiting binding (declared in wrangler.jsonc). */
  RATE_LIMITER?: RateLimitBinding;
  /** Comma-separated CORS allowlist; empty = same-origin mode (default). */
  ALLOWED_ORIGINS?: string;
  /** "true" rewrites Set-Cookie SameSite=Lax → None (cross-origin mode). */
  FORCE_SAMESITE_NONE?: string;
  /** Request body cap in MB (must not exceed the backend's limit). */
  MAX_BODY_MB?: string;
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Methods the API actually uses — anything else is rejected early. */
const ALLOWED_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

/**
 * Routes that may be called without a bearer token. The FastAPI backend
 * performs full authentication on everything else (and on these too, where
 * applicable) — this list only controls the gateway's presence check.
 */
const PUBLIC_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/logout-all",
  "/api/v1/health",
  "/api/v1/ready",
  "/api/v1/version",
  "/api/v1/stats",
  "/api/v1/visit",
]);

/** Request headers forwarded to the origin (everything else is dropped). */
const FORWARDED_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "origin",
  "referer",
  "user-agent",
  "x-request-id",
  "x-user-api-key",
  "x-user-base-url",
];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const clientIp = request.headers.get("cf-connecting-ip") ?? "?";
    const requestId = resolveRequestId(request);

    // The Worker route only matches /api/*, but never trust routing blindly.
    if (!url.pathname.startsWith("/api/")) {
      return apiError(404, "Not found", requestId);
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return apiError(405, "Method not allowed", requestId);
    }

    // Cross-origin fallback mode: answer CORS preflights directly.
    if (request.method === "OPTIONS") {
      return handlePreflight(request, env, requestId);
    }

    // Cheap Content-Length cap; chunked bodies without a length are capped
    // again by the origin reverse proxy and FastAPI itself.
    const maxBodyBytes =
      Number.parseInt(env.MAX_BODY_MB ?? "25", 10) * 1024 * 1024;
    const contentLength = Number.parseInt(
      request.headers.get("content-length") ?? "",
      10,
    );
    if (!Number.isNaN(contentLength) && contentLength > maxBodyBytes) {
      return apiError(413, "Request body too large", requestId);
    }

    const limited = await isRateLimited(request, env);
    if (limited) {
      audit("rate_limited", request, clientIp, requestId, url.pathname);
      return apiError(429, "Too many requests", requestId, {
        "Retry-After": "60",
      });
    }

    const authHeader = request.headers.get("authorization") ?? "";
    if (!PUBLIC_PATHS.has(url.pathname) && !authHeader.startsWith("Bearer ")) {
      audit("missing_token", request, clientIp, requestId, url.pathname);
      return apiError(401, "Not authenticated", requestId);
    }

    return proxyToOrigin(request, env, url, requestId, clientIp);
  },
} satisfies {
  fetch(request: Request, env: Env): Promise<Response>;
};

async function proxyToOrigin(
  request: Request,
  env: Env,
  url: URL,
  requestId: string,
  clientIp: string,
): Promise<Response> {
  const originBase = (env.ORIGIN_URL ?? "").replace(/\/+$/, "");
  if (!originBase) {
    return apiError(502, "Gateway misconfigured: missing ORIGIN_URL", requestId);
  }

  // Rebuild headers from an allowlist so clients can neither spoof the
  // origin token nor inject forwarding metadata.
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (env.ORIGIN_TOKEN) headers.set("X-Origin-Token", env.ORIGIN_TOKEN);
  if (clientIp !== "?") headers.set("X-Forwarded-For", clientIp);
  headers.set("X-Forwarded-Proto", "https");

  const canHaveBody = !["GET", "HEAD"].includes(request.method);
  const originRequest = new Request(originBase + url.pathname + url.search, {
    method: request.method,
    headers,
    body: canHaveBody ? request.body : undefined,
    redirect: "manual",
  });

  let response: Response;
  try {
    response = await fetch(originRequest);
  } catch {
    audit("origin_unreachable", request, clientIp, requestId, url.pathname);
    return apiError(502, "Origin unavailable", requestId);
  }

  const outHeaders = new Headers(response.headers);
  applySecurityHeaders(outHeaders);
  if (!outHeaders.has("Cache-Control")) {
    outHeaders.set("Cache-Control", "no-store");
  }

  // Cross-origin fallback: the backend's SameSite=Lax cookie would not be
  // sent across sites; rewrite it so the refresh flow keeps working.
  if ((env.FORCE_SAMESITE_NONE ?? "").toLowerCase() === "true") {
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      outHeaders.delete("Set-Cookie");
      for (const cookie of cookies) {
        outHeaders.append(
          "Set-Cookie",
          cookie.replace(/SameSite\s*=\s*Lax/i, "SameSite=None"),
        );
      }
    }
  }

  const cors = corsHeadersFor(request, env);
  if (cors) {
    for (const [name, value] of Object.entries(cors)) {
      outHeaders.set(name, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

/** Rate limit per bearer token (falling back to per-IP); fails open. */
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  if (!env.RATE_LIMITER) return false;
  try {
    const key = await rateLimitKey(request);
    const { success } = await env.RATE_LIMITER.limit({ key });
    return !success;
  } catch {
    // Binding errors (quota exhaustion, cold path) must not take the API down.
    return false;
  }
}

async function rateLimitKey(request: Request): Promise<string> {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(auth),
    );
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return `user:${hex.slice(0, 32)}`;
  }
  return `ip:${request.headers.get("cf-connecting-ip") ?? "unknown"}`;
}

function handlePreflight(
  request: Request,
  env: Env,
  requestId: string,
): Response {
  const cors = corsHeadersFor(request, env);
  if (!cors) return apiError(403, "Origin not allowed", requestId);
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    },
  });
}

/** CORS headers when the request Origin is allowlisted, else null. */
function corsHeadersFor(
  request: Request,
  env: Env,
): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods":
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-User-Api-Key, X-User-Base-Url, X-Request-Id",
    Vary: "Origin",
  };
}

function applySecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}

/** Accept a well-formed client X-Request-Id, else generate one (as the
 * FastAPI security middleware does) so errors can be correlated end to end. */
function resolveRequestId(request: Request): string {
  const raw = request.headers.get("x-request-id") ?? "";
  if (REQUEST_ID_PATTERN.test(raw)) return raw;
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function apiError(
  status: number,
  detail: string,
  requestId: string,
  extra?: Record<string, string>,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Request-ID": requestId,
    ...extra,
  });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify({ detail, request_id: requestId }), {
    status,
    headers,
  });
}

function audit(
  reason: string,
  request: Request,
  clientIp: string,
  requestId: string,
  path: string,
): void {
  console.log(
    JSON.stringify({
      event: "security_event",
      reason,
      method: request.method,
      path,
      client: clientIp,
      request_id: requestId,
    }),
  );
}
