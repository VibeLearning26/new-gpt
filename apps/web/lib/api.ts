let redirectingToLogin = false;

function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem("access_token");
  return token && !token.startsWith("demo-token-") ? token : null;
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("vibegpt_user");
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

async function requestApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const apiUrl = configuredUrl.replace(/\/+$/, "");
  const normalizedEndpoint =
    apiUrl.endsWith("/api/v1") && endpoint.startsWith("/api/v1")
      ? endpoint.slice("/api/v1".length)
      : endpoint;
  const token = readAccessToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiUrl}${normalizedEndpoint}`, {
    ...options,
    headers,
    credentials: options.credentials ?? "include",
  });

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
    throw new Error(errorDetail);
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
  sources: ApiSourceInfo[];
  model: string | null;
  processing_ms: number | null;
  created_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when we hold a real backend session (not the demo mock token). */
export function hasRealSession(): boolean {
  if (typeof window === "undefined") return false;
  const token = sessionStorage.getItem("access_token");
  return !!token && !token.startsWith("demo-token");
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Call the real RAG pipeline: POST /api/v1/student/answers. */
export async function askQuestion(params: {
  subject_id: string;
  module_id?: string | null;
  marks: number;
  question: string;
}): Promise<ApiAnswerResponse> {
  return fetchApi("/api/v1/student/answers", {
    method: "POST",
    body: JSON.stringify({
      subject_id: params.subject_id,
      module_id: params.module_id ?? null,
      marks: params.marks,
      question: params.question,
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

export async function apiLogin(email: string, password: string): Promise<ApiTokenResponse> {
  return fetchApi("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
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

export const adminApi = {
  getDashboard: (): Promise<ApiDashboard> =>
    fetchApi("/api/v1/admin/dashboard"),

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
