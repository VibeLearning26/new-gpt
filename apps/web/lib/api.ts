let redirectingToLogin = false;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Access tokens live in memory ONLY — never in web storage, so XSS cannot
// steal them. A non-secret sessionStorage marker records that a real session
// exists so pages don't fall back to demo mode across reloads; the actual
// token is restored silently via the HttpOnly refresh cookie.
let accessToken: string | null = null;
const SESSION_MARKER = "vibegpt_session";

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") return;
  if (token && !token.startsWith("demo-token-")) {
    sessionStorage.setItem(SESSION_MARKER, "real");
  } else if (!token) {
    sessionStorage.removeItem(SESSION_MARKER);
  }
}

function readAccessToken(): string | null {
  return accessToken && !accessToken.startsWith("demo-token-") ? accessToken : null;
}

export function clearAuthSession(): void {
  accessToken = null;
  if (typeof window === "undefined") return;
  // Remove tokens written by pre-hardening builds as well.
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem(SESSION_MARKER);
  sessionStorage.removeItem("vibegpt_user");
}

/* ── Bring-your-own API key ───────────────────────────────────
   Stored locally in the browser (the user's own key, their device).
   Sent to the backend as X-User-Api-Key, which forwards it to the gateway
   so requests are billed to the user's own account. */
const USER_API_KEY = "vibegpt_user_api_key";

export function getUserApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_API_KEY);
}

export function setUserApiKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(USER_API_KEY, key);
  else localStorage.removeItem(USER_API_KEY);
}

/* ── Bring-your-own base URL ────────────────────────────────────
   Optional custom base URL for OpenAI-compatible endpoints.
   Sent to the backend as X-User-Base-Url. */
const USER_BASE_URL = "vibegpt_user_base_url";

export function getUserBaseUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_BASE_URL);
}

export function setUserBaseUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url) localStorage.setItem(USER_BASE_URL, url);
  else localStorage.removeItem(USER_BASE_URL);
}

function handleUnauthorized(errorDetail: string): void {
  if (typeof window === "undefined") return;
  clearAuthSession();
  sessionStorage.setItem("vibegpt_auth_error", errorDetail);
  if (!redirectingToLogin && window.location.pathname !== "/login") {
    redirectingToLogin = true;
    window.location.replace("/login");
  }
}

function apiUrlBase(): { apiUrl: string; normalize: (endpoint: string) => string } {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const apiUrl = configuredUrl.replace(/\/+$/, "");
  return {
    apiUrl,
    normalize: (endpoint: string) =>
      apiUrl.endsWith("/api/v1") && endpoint.startsWith("/api/v1")
        ? endpoint.slice("/api/v1".length)
        : endpoint,
  };
}

// Single-flight silent refresh via the HttpOnly cookie.
let refreshPromise: Promise<string | null> | null = null;

export function refreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { apiUrl, normalize } = apiUrlBase();
        const res = await fetch(`${apiUrl}${normalize("/api/v1/auth/refresh")}`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { access_token: string };
        setAccessToken(data.access_token);
        return data.access_token;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function requestApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const { apiUrl, normalize } = apiUrlBase();
  const normalizedEndpoint = normalize(endpoint);
  const url = `${apiUrl}${normalizedEndpoint}`;

  const headers = new Headers(options.headers);
  const token = readAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const userKey = getUserApiKey();
  if (userKey) {
    headers.set("X-User-Api-Key", userKey);
  }
  const userBaseUrl = getUserBaseUrl();
  if (userBaseUrl) {
    headers.set("X-User-Base-Url", userBaseUrl);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const doFetch = (h: Headers) =>
    fetch(url, { ...options, headers: h, credentials: options.credentials ?? "include" });

  let response = await doFetch(headers);

  // Expired access token → one silent refresh + retry (not for auth routes
  // or demo sessions).
  if (
    response.status === 401 &&
    !normalizedEndpoint.startsWith("/auth/") &&
    token
  ) {
    const newToken = await refreshSession();
    if (newToken) {
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      if (!retryHeaders.has("Content-Type") && !(options.body instanceof FormData)) {
        retryHeaders.set("Content-Type", "application/json");
      }
      if (userKey) {
        retryHeaders.set("X-User-Api-Key", userKey);
      }
      if (userBaseUrl) {
        retryHeaders.set("X-User-Base-Url", userBaseUrl);
      }
      response = await doFetch(retryHeaders);
    }
  }

  if (!response.ok) {
    let errorDetail = "API Request Failed";
    try {
      const errorData = await response.json();
      if (typeof errorData.detail === "string") {
        errorDetail = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorDetail = errorData.detail
          .map((item: { msg?: string }) => item.msg)
          .filter(Boolean)
          .join("; ") || errorDetail;
      }
    } catch {}
    if (response.status === 401) handleUnauthorized(errorDetail);
    throw new ApiError(errorDetail, response.status);
  }

  return response;
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const response = await requestApi(endpoint, options);
  return response.json();
}

/** Fetch a binary file through the authenticated API. */
export async function fetchApiBlob(endpoint: string): Promise<Blob> {
  const response = await requestApi(endpoint);
  return response.blob();
}

// ── Ask-question (RAG) API ─────────────────────────────────────
// Mirrors services/api app/schemas/question.py

export interface ApiSourceInfo {
  label: string;
  document_id: string;
  document_name: string;
  page_number: number | null;
  slide_number: number | null;
  sheet_name: string | null;
  preview: string | null;
  relevance_score: number | null;
}

export interface ApiAnswerResponse {
  id: string;
  status: string;
  answer: string | null;
  word_count: number | null;
  marks: number;
  question: string;
  subject_id: string;
  subject_name: string;
  sources: ApiSourceInfo[];
  model: string | null;
  processing_ms: number | null;
  session_id: string | null;
  created_at: string;
}

export interface ApiChatSession {
  id: string;
  title: string;
  subject_id: string | null;
  model_name: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiSessionMessage {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  marks: number;
  model_name: string | null;
  word_count: number | null;
  processing_ms: number | null;
  subject_name: string | null;
  module_name: string | null;
  sources: ApiSourceInfo[];
  feedback_rating: number | null;
  feedback_comment: string | null;
  created_at: string;
}

export interface ApiAdminFeedback {
  id: string;
  student_name: string;
  question: string;
  answer_preview: string | null;
  subject_name: string | null;
  marks: number;
  rating: number;
  comment: string | null;
  status: "new" | "reviewed" | "resolved";
  admin_response: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a real backend session exists (in-memory token, or the
 * non-secret marker survives a reload while the cookie restores the token). */
export function hasRealSession(): boolean {
  if (accessToken && !accessToken.startsWith("demo-token")) return true;
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_MARKER) === "real";
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Call the real RAG pipeline: POST /api/v1/student/answers. */
export async function askQuestion(params: {
  subject_id?: string | null;
  module_id?: string | null;
  marks: number;
  question: string;
  model?: string | null;
  session_id?: string | null;
  attachments?: ApiChatAttachment[];
}): Promise<ApiAnswerResponse> {
  return fetchApi("/api/v1/student/answers", {
    method: "POST",
    body: JSON.stringify({
      subject_id: params.subject_id ?? null,
      module_id: params.module_id ?? null,
      marks: params.marks,
      question: params.question,
      model: params.model ?? null,
      session_id: params.session_id ?? null,
      attachments: params.attachments ?? [],
    }),
  });
}

// ── Auth ───────────────────────────────────────────────────────

export interface ApiTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: "super_admin" | "admin" | "student";
}

export async function apiLogin(
  email: string,
  password: string,
  mfaCode?: string,
): Promise<ApiTokenResponse> {
  const result = await fetchApi("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, mfa_code: mfaCode || null }),
  });
  setAccessToken(result.access_token);
  return result;
}

/** Revoke every session for the current user (all devices). */
export async function apiLogoutAll(): Promise<{ message: string }> {
  return fetchApi("/api/v1/auth/logout-all", { method: "POST" });
}

/** Revoke the current refresh token (HttpOnly cookie) server-side. */
export async function apiLogout(): Promise<{ message: string }> {
  const { apiUrl, normalize } = apiUrlBase();
  try {
    await fetch(`${apiUrl}${normalize("/api/v1/auth/logout")}`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // best effort — local state is cleared regardless
  }
  clearAuthSession();
  return { message: "Logged out" };
}

// ── Admin: subjects / modules / documents ─────────────────────
// Mirrors services/api app/schemas/academic.py and admin endpoints

export interface ApiDepartment {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
}

export interface ApiSubject {
  id: string;
  name: string;
  code: string;
  description: string | null;
  department_id: string;
  semester_id: string;
  credits: number | null;
  is_active: boolean;
  department_name?: string | null;
  semester_name?: string | null;
}

export interface ApiModule {
  id: string;
  name: string;
  number: number;
  description: string | null;
  subject_id: string;
  is_active: boolean;
}

export interface ApiSemester {
  id: string;
  number: number;
  name: string;
  is_active: boolean;
}

export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  role: "super_admin" | "admin" | "student";
  department_id: string | null;
  semester_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface ApiDocument {
  id: string;
  document_name: string;
  original_filename: string;
  status: string;
  source_type: string;
  file_size: number;
  total_chunks: number;
  created_at: string;
}

export interface ApiDashboard {
  published_documents: number;
  pending_documents: number;
  review_documents: number;
  failed_jobs: number;
  total_students: number;
  questions_today: number;
  avg_processing_ms: number;
  low_rated_answers: number;
}

export type SourceTypeValue =
  | "pdf_notes"
  | "pptx_presentation"
  | "docx_notes"
  | "xlsx_question_bank"
  | "previous_year_paper"
  | "teacher_answer"
  | "teacher_example"
  | "other";

export interface ApiRouterStatus {
  provider: "ollama" | "router";
  base_url: string;
  dashboard_url: string;
  default_model: string;
  reachable: boolean;
  models_total: number;
  models_available: number;
  available_models: string[];
  active_default: string | null;
}

export interface ApiPublicStats {
  active_now: number;
  active_24h: number;
  total_questions: number;
  total_subjects: number;
  published_documents: number;
  total_chunks: number;
  avg_rating: number | null;
  total_visitors: number;
}

export const publicApi = {
  getStats: (): Promise<ApiPublicStats> => fetchApi("/api/v1/stats"),
  trackVisit: (): Promise<{ total_visitors: number }> =>
    fetchApi("/api/v1/visit", { method: "POST" }),
};

export const adminApi = {
  getDashboard: (): Promise<ApiDashboard> =>
    fetchApi("/api/v1/admin/dashboard"),

  getRouterStatus: (): Promise<ApiRouterStatus> =>
    fetchApi("/api/v1/admin/router/status"),

  listFeedback: (): Promise<ApiAdminFeedback[]> => fetchApi("/api/v1/admin/feedback"),

  reviewFeedback: (
    id: string,
    body: { status: "reviewed" | "resolved"; admin_response?: string | null },
  ): Promise<ApiAdminFeedback> =>
    fetchApi(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteFeedback: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getSettings: (): Promise<Record<string, string>> =>
    fetchApi("/api/v1/admin/settings"),

  updateSettings: (settings: Record<string, string>): Promise<{ message: string }> =>
    fetchApi("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify(settings) }),

  listDepartments: (): Promise<ApiDepartment[]> => fetchApi("/api/v1/admin/departments"),

  listArchivedDepartments: (): Promise<ApiDepartment[]> => fetchApi("/api/v1/admin/departments/archived"),

  createDepartment: (data: { name: string; code: string; description?: string }): Promise<ApiDepartment> =>
    fetchApi("/api/v1/admin/departments", { method: "POST", body: JSON.stringify(data) }),

  archiveDepartment: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/departments/${id}`, { method: "DELETE" }),

  unarchiveDepartment: (id: string): Promise<ApiDepartment> =>
    fetchApi(`/api/v1/admin/departments/${id}/unarchive`, { method: "POST" }),

  deleteDepartment: (id: string, code: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/departments/${id}/force`, {
      method: "DELETE",
      body: JSON.stringify({ code }),
    }),

  listSemesters: (): Promise<ApiSemester[]> => fetchApi("/api/v1/admin/semesters"),

  listSubjects: (): Promise<ApiSubject[]> => fetchApi("/api/v1/admin/subjects"),

  listUsers: (): Promise<ApiUser[]> => fetchApi("/api/v1/admin/users"),

  createSubject: (data: { name: string; code: string; semester_id: string; department_id: string }): Promise<ApiSubject> =>
    fetchApi("/api/v1/admin/subjects", { method: "POST", body: JSON.stringify(data) }),

  updateSubject: (id: string, data: Partial<ApiSubject>): Promise<ApiSubject> =>
    fetchApi(`/api/v1/admin/subjects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveSubject: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/subjects/${id}`, { method: "DELETE" }),

  listArchivedSubjects: (): Promise<ApiSubject[]> => fetchApi("/api/v1/admin/subjects/archived"),

  unarchiveSubject: (id: string): Promise<ApiSubject> =>
    fetchApi(`/api/v1/admin/subjects/${id}/unarchive`, { method: "POST" }),

  deleteSubject: (id: string, code: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/subjects/${id}/force`, {
      method: "DELETE",
      body: JSON.stringify({ code }),
    }),

  listModules: (subjectId: string): Promise<ApiModule[]> =>
    fetchApi(`/api/v1/admin/modules?subject_id=${encodeURIComponent(subjectId)}`),

  createModule: (data: { name: string; number: number; subject_id: string }): Promise<ApiModule> =>
    fetchApi("/api/v1/admin/modules", { method: "POST", body: JSON.stringify(data) }),

  updateModule: (id: string, data: { name: string }): Promise<ApiModule> =>
    fetchApi(`/api/v1/admin/modules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveModule: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/modules/${id}`, { method: "DELETE" }),

  listDocuments: (subjectId?: string): Promise<ApiDocument[]> =>
    fetchApi(
      subjectId
        ? `/api/v1/admin/documents?subject_id=${encodeURIComponent(subjectId)}`
        : "/api/v1/admin/documents",
    ),

  publishDocument: (documentId: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/documents/${documentId}/publish`, { method: "POST" }),

  deleteDocument: (documentId: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/admin/documents/${documentId}`, { method: "DELETE" }),

  uploadDocument: (params: {
    file: File;
    subject_id: string;
    module_id?: string | null;
    source_type?: SourceTypeValue;
    description?: string;
    topic?: string;
  }): Promise<{ id: string; document_name: string; status: string }> => {
    const form = new FormData();
    form.append("file", params.file);
    form.append("subject_id", params.subject_id);
    if (params.module_id) form.append("module_id", params.module_id);
    form.append("source_type", params.source_type ?? "other");
    if (params.description) form.append("description", params.description);
    if (params.topic) form.append("topic", params.topic);
    return fetchApi("/api/v1/admin/documents/upload", { method: "POST", body: form });
  },
};

// ── Admin analytics ─────────────────────────────────────────
// Mirrors services/api app/schemas/analytics.py

export type AnalyticsRange = "day" | "month" | "year" | "all";

export interface AnalyticsTimePoint {
  t: string;
  value: number;
}

export interface AnalyticsNamedCount {
  name: string;
  count: number;
  code: string | null;
}

export interface AnalyticsHourCount {
  hour: number;
  count: number;
}

export interface AnalyticsUserMetric {
  user_id: string;
  name: string;
  value: number;
}

export interface AnalyticsPayload {
  range: AnalyticsRange;
  kpis: {
    total_questions: number;
    questions_today: number;
    total_tokens: number;
    active_users_24h: number;
    total_students: number;
    avg_response_ms: number;
    avg_rating: number | null;
    published_documents: number;
  };
  tokens: {
    total: number;
    avg_per_question: number;
    series: AnalyticsTimePoint[];
    per_user: AnalyticsUserMetric[];
  };
  usage: {
    questions_series: AnalyticsTimePoint[];
    by_subject: AnalyticsNamedCount[];
    marks_distribution: AnalyticsNamedCount[];
    peak_hours: AnalyticsHourCount[];
  };
  users: {
    active_now: number;
    active_today: number;
    active_week: number;
    active_month: number;
    signups_series: AnalyticsTimePoint[];
    most_active: AnalyticsUserMetric[];
    logins_series: AnalyticsTimePoint[];
  };
  performance: {
    avg_ms: number;
    trend_pct: number | null;
    rating_distribution: AnalyticsNamedCount[];
    low_rated: number;
  };
  content: {
    documents_by_status: AnalyticsNamedCount[];
    subjects: number;
    departments: number;
  };
}

export const analyticsApi = {
  getAnalytics: (range: AnalyticsRange): Promise<AnalyticsPayload> =>
    fetchApi(`/api/v1/admin/analytics?range=${range}`),
};

// ── Student API ──────────────────────────────────────────────

export interface ApiSubjectDocument {
  id: string;
  document_name: string;
  source_type: SourceTypeValue;
  file_size: number;
  topic: string | null;
  description: string | null;
  total_chunks: number;
  published_at: string;
}

export type ApiInputModality = "text" | "image" | "document" | "audio" | "video";

export interface ApiChatAttachment {
  filename: string;
  mime_type: string;
  data_url: string;
}

export interface ApiModel {
  id: string;
  owned_by: string | null;
  input_modalities: ApiInputModality[];
}

export interface ApiModelsResponse {
  provider: "ollama" | "router";
  models: ApiModel[];
  default: string;
}

export interface ApiHistoryItem {
  id: string;
  subject_name: string;
  module_name: string | null;
  marks: number;
  question: string;
  answer_preview: string | null;
  status: string;
  created_at: string;
  is_saved: boolean;
}

export const studentApi = {
  listSubjects: (): Promise<ApiSubject[]> => fetchApi("/api/v1/student/subjects"),

  listModels: (): Promise<ApiModelsResponse> => fetchApi("/api/v1/student/models"),

  listModules: (subjectId: string): Promise<ApiModule[]> =>
    fetchApi(`/api/v1/student/subjects/${encodeURIComponent(subjectId)}/modules`),

  listSubjectDocuments: (subjectId: string): Promise<ApiSubjectDocument[]> =>
    fetchApi(`/api/v1/student/subjects/${encodeURIComponent(subjectId)}/documents`),

  getDocumentFile: (documentId: string): Promise<Blob> =>
    fetchApiBlob(`/api/v1/student/documents/${encodeURIComponent(documentId)}/file`),

  getHistory: (pageSize = 20): Promise<ApiHistoryItem[]> =>
    fetchApi(`/api/v1/student/history?page=1&page_size=${pageSize}`),

  getSavedAnswers: (): Promise<ApiHistoryItem[]> => fetchApi("/api/v1/student/saved-answers"),

  saveAnswer: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/student/history/${id}/save`, { method: "POST" }),

  unsaveAnswer: (id: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/student/history/${id}/save`, { method: "DELETE" }),

  listChatSessions: (): Promise<ApiChatSession[]> =>
    fetchApi("/api/v1/student/chat-sessions"),

  getSessionMessages: (sessionId: string): Promise<ApiSessionMessage[]> =>
    fetchApi(`/api/v1/student/chat-sessions/${encodeURIComponent(sessionId)}/messages`),

  renameChatSession: (sessionId: string, title: string): Promise<ApiChatSession> =>
    fetchApi(`/api/v1/student/chat-sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  deleteChatSession: (sessionId: string): Promise<{ message: string }> =>
    fetchApi(`/api/v1/student/chat-sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),

  submitFeedback: (body: {
    question_log_id: string;
    rating: number;
    comment?: string | null;
  }): Promise<{ message: string }> =>
    fetchApi("/api/v1/student/feedback", { method: "POST", body: JSON.stringify(body) }),
};

/** Infer the backend SourceType from a filename + admin's chosen category. */
export function inferSourceType(filename: string, category: SourceTypeValue | "auto"): SourceTypeValue {
  if (category !== "auto") return category;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "pdf_notes";
    case "pptx":
      return "pptx_presentation";
    case "docx":
      return "docx_notes";
    case "xlsx":
      return "xlsx_question_bank";
    default:
      return "other";
  }
}
