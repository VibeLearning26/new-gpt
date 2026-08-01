// Mock domain data + a local "answer generator" so the whole platform
// is clickable with no backend. Swap these for real API calls later.

export interface Module {
  id: string;
  name: string;
  materials: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  icon: string;
  semester: string; // e.g. "S5"
  department: string; // department code, e.g. "CSE"
  keywords: string[]; // used to route a question to this subject
  modules: Module[];
  materials: number;
}

export interface SourceRef {
  tag: string;
  document: string;
  location: string;
  preview: string;
}

export interface StudyAnswer {
  question: string;
  marks: number;
  subject: string;
  module: string;
  body: string;
  wordCount: number;
  processingMs: number;
  sources: SourceRef[];
  model?: string | null;
  drawing?: {
    drawingId: string;
    title: string;
    svg: string;
    spec: Record<string, unknown>;
    warnings: string[];
  } | null;
}

export interface Conversation {
  id: string;
  title: string;
  subject: string;
  when: string;
}

export interface SavedAnswer {
  id: string;
  question: string;
  subject: string;
  marks: number;
  savedAt: string;
  excerpt: string;
}

export const SUBJECTS: Subject[] = [
  // ── Semester 5 ──────────────────────────────────────────────
  {
    id: "dbms",
    name: "Database Management Systems",
    code: "CS301",
    icon: "🗄️",
    semester: "S5",
    department: "CSE",
    keywords: [
      "database", "dbms", "sql", "query", "relational", "table", "schema",
      "normalization", "normal form", "bcnf", "acid", "transaction", "join",
      "primary key", "foreign key", "index", "indexing", "tuple", "entity",
      "er diagram", "concurrency", "isolation",
    ],
    materials: 24,
    modules: [
      { id: "dbms-1", name: "Relational Model & Algebra", materials: 6 },
      { id: "dbms-2", name: "SQL & Normalization", materials: 7 },
      { id: "dbms-3", name: "Transactions & Concurrency", materials: 5 },
      { id: "dbms-4", name: "Indexing & Query Optimization", materials: 6 },
    ],
  },
  {
    id: "os",
    name: "Operating Systems",
    code: "CS302",
    icon: "🖥️",
    semester: "S5",
    department: "CSE",
    keywords: [
      "operating system", "process", "thread", "scheduling", "scheduler",
      "cpu", "round robin", "sjf", "fcfs", "memory", "paging", "segmentation",
      "page fault", "deadlock", "semaphore", "mutex", "synchronization",
      "context switch", "virtual memory", "kernel",
    ],
    materials: 21,
    modules: [
      { id: "os-1", name: "Processes & Threads", materials: 5 },
      { id: "os-2", name: "CPU Scheduling", materials: 5 },
      { id: "os-3", name: "Memory Management", materials: 6 },
      { id: "os-4", name: "Deadlocks & Synchronization", materials: 5 },
    ],
  },
  {
    id: "cn",
    name: "Computer Networks",
    code: "CS303",
    icon: "🌐",
    semester: "S5",
    department: "CSE",
    keywords: [
      "network", "networking", "osi", "tcp", "udp", "ip", "packet", "routing",
      "router", "switch", "switching", "transport layer", "application layer",
      "protocol", "http", "dns", "ethernet", "subnet", "congestion", "socket",
    ],
    materials: 19,
    modules: [
      { id: "cn-1", name: "OSI & TCP/IP Models", materials: 5 },
      { id: "cn-2", name: "Routing & Switching", materials: 5 },
      { id: "cn-3", name: "Transport Layer", materials: 4 },
      { id: "cn-4", name: "Application Layer Protocols", materials: 5 },
    ],
  },
  {
    id: "daa",
    name: "Design & Analysis of Algorithms",
    code: "CS304",
    icon: "🧮",
    semester: "S5",
    department: "CSE",
    keywords: [
      "algorithm", "asymptotic", "complexity", "big o", "recurrence",
      "master theorem", "divide and conquer", "greedy", "dynamic programming",
      "dp", "graph", "dijkstra", "shortest path", "spanning tree", "kruskal",
      "prim", "sorting", "merge sort", "quick sort", "np", "optimization",
    ],
    materials: 26,
    modules: [
      { id: "daa-1", name: "Asymptotic Analysis", materials: 6 },
      { id: "daa-2", name: "Divide & Conquer", materials: 6 },
      { id: "daa-3", name: "Greedy & Dynamic Programming", materials: 8 },
      { id: "daa-4", name: "Graph Algorithms", materials: 6 },
    ],
  },
  // ── Semester 3 ──────────────────────────────────────────────
  {
    id: "ds",
    name: "Data Structures",
    code: "CS201",
    icon: "🌳",
    semester: "S3",
    department: "CSE",
    keywords: [
      "data structure", "array", "linked list", "stack", "queue", "tree",
      "binary tree", "bst", "heap", "hash", "hashing", "hash table", "graph",
      "traversal", "recursion", "pointer", "node", "avl", "trie",
    ],
    materials: 18,
    modules: [
      { id: "ds-1", name: "Arrays & Linked Lists", materials: 5 },
      { id: "ds-2", name: "Stacks & Queues", materials: 4 },
      { id: "ds-3", name: "Trees & Heaps", materials: 5 },
      { id: "ds-4", name: "Hashing & Graphs", materials: 4 },
    ],
  },
  {
    id: "dm",
    name: "Discrete Mathematics",
    code: "MA201",
    icon: "➗",
    semester: "S3",
    department: "CSE",
    keywords: [
      "discrete", "set", "sets", "relation", "function", "logic",
      "proposition", "predicate", "proof", "induction", "combinatorics",
      "permutation", "combination", "graph theory", "counting", "boolean",
      "recurrence relation", "modular", "number theory",
    ],
    materials: 15,
    modules: [
      { id: "dm-1", name: "Set Theory & Logic", materials: 4 },
      { id: "dm-2", name: "Relations & Functions", materials: 4 },
      { id: "dm-3", name: "Combinatorics", materials: 3 },
      { id: "dm-4", name: "Graph Theory", materials: 4 },
    ],
  },
];

export const RECENT_CONVERSATIONS: Conversation[] = [
  { id: "c1", title: "Explain ACID properties", subject: "DBMS", when: "2h ago" },
  { id: "c2", title: "Round Robin vs SJF scheduling", subject: "OS", when: "Yesterday" },
  { id: "c3", title: "Difference: TCP and UDP", subject: "CN", when: "Yesterday" },
  { id: "c4", title: "Dijkstra's algorithm steps", subject: "DAA", when: "2 days ago" },
  { id: "c5", title: "Normalization up to BCNF", subject: "DBMS", when: "3 days ago" },
];

export const SAVED_ANSWERS: SavedAnswer[] = [
  {
    id: "s1",
    question: "Explain the ACID properties of a transaction.",
    subject: "DBMS",
    marks: 10,
    savedAt: "Jul 10, 2026",
    excerpt:
      "ACID is the set of four guarantees — Atomicity, Consistency, Isolation, Durability — that keep database transactions reliable...",
  },
  {
    id: "s2",
    question: "Compare paging and segmentation.",
    subject: "OS",
    marks: 5,
    savedAt: "Jul 9, 2026",
    excerpt:
      "Paging divides memory into fixed-size frames while segmentation uses variable-size logical units aligned to program structure...",
  },
  {
    id: "s3",
    question: "State and prove the Master Theorem.",
    subject: "DAA",
    marks: 10,
    savedAt: "Jul 7, 2026",
    excerpt:
      "The Master Theorem provides asymptotic bounds for divide-and-conquer recurrences of the form T(n) = aT(n/b) + f(n)...",
  },
];

export const MARKS_OPTIONS = [2, 3, 5, 8, 10];

export const SEMESTER_OPTIONS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];

export const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "AIML", name: "Artificial Intelligence and Machine Learning" },
  { code: "ECE", name: "Electronics and Communication Engineering" },
  { code: "EEE", name: "Electrical and Electronics Engineering" },
  { code: "ME", name: "Mechanical Engineering" },
  { code: "CE", name: "Civil Engineering" },
  { code: "IT", name: "Information Technology" },
  { code: "AE", name: "Automobile Engineering" },
  { code: "SH", name: "Science and Humanities" },
] as const;

// Semesters that actually have subjects/materials, in order.
export const ACTIVE_SEMESTERS = SEMESTER_OPTIONS.filter((sem) =>
  SUBJECTS.some((s) => s.semester === sem),
);

export function subjectsBySemester(sem: string): Subject[] {
  return SUBJECTS.filter((s) => s.semester === sem);
}

export interface RouteResult {
  subject: Subject;
  module: Module;
  confidence: "high" | "low";
}

// Mock "AI router": decides which subject (and module) a question belongs to,
// scoped to the chosen semester. This is the seam where a real RAG / classifier
// API call would later plug in — swap the keyword scoring for a fetch().
export function routeQuestion(
  question: string,
  sem: string,
  catalog: Subject[] = SUBJECTS,
): RouteResult | null {
  const subjects = catalog.filter((s) => s.semester === sem);
  if (subjects.length === 0) return null;

  const q = question.toLowerCase();

  const scoreSubject = (s: Subject) =>
    s.keywords.reduce((acc, kw) => (q.includes(kw.toLowerCase()) ? acc + 1 : acc), 0);

  let best = subjects[0];
  let bestScore = scoreSubject(best);
  for (const s of subjects.slice(1)) {
    const score = scoreSubject(s);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }

  // Within the chosen subject, pick the module whose name words best match.
  const scoreModule = (m: Module) =>
    m.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3)
      .reduce((acc, w) => (q.includes(w) ? acc + 1 : acc), 0);

  if (best.modules.length === 0) {
    return {
      subject: best,
      module: { id: `${best.id}-general`, name: "General", materials: 0 },
      confidence: bestScore > 0 ? "high" : "low",
    };
  }

  let bestModule = best.modules[0];
  let moduleScore = scoreModule(bestModule);
  for (const m of best.modules.slice(1)) {
    const score = scoreModule(m);
    if (score > moduleScore) {
      bestModule = m;
      moduleScore = score;
    }
  }

  return { subject: best, module: bestModule, confidence: bestScore > 0 ? "high" : "low" };
}

// ── Mock structured answer generator ────────────────────────────
export function generateMockAnswer(
  question: string,
  marks: number,
  subjectName: string,
  moduleName: string,
): StudyAnswer {
  const topic = question.replace(/[?.]/g, "").trim() || "the selected topic";

  const shortBody = `**Definition.** ${capitalize(topic)} refers to a core concept within ${moduleName}. It is defined as the principle by which the underlying system achieves its intended, well-specified behaviour.\n\nKey identifiers: it is precise, verifiable against approved course material, and directly examinable at the ${marks}-mark level.`;

  const mediumBody = `**Introduction.** ${capitalize(topic)} is a fundamental concept covered under *${moduleName}* in ${subjectName}.\n\n**Explanation.** It describes how the system organises and guarantees correct behaviour. The idea is applied whenever we need predictable, repeatable outcomes.\n\n**Key points:**\n- Clearly defined scope and assumptions\n- Well-understood trade-offs and constraints\n- Standard technique used across the module\n- Directly supported by the approved study material\n\n**Summary.** For a ${marks}-mark answer, state the definition, give the mechanism, and list the salient properties.`;

  const longBody = `**Introduction.** ${capitalize(topic)} is a central topic in *${moduleName}* under ${subjectName}. A strong exam answer defines it precisely, explains the mechanism, and supports each claim with course material.\n\n**Detailed explanation.** The concept works by decomposing the problem into well-defined stages. Each stage has an explicit responsibility, and correctness follows from combining the guarantees of the individual stages. This layered reasoning is what makes the approach both provable and practical.\n\n**Key points:**\n- **Definition** — a precise statement of what the concept guarantees\n- **Mechanism** — the step-by-step process that delivers the guarantee\n- **Properties** — the invariants that always hold\n- **Trade-offs** — the cost paid for the guarantee (time, space, or complexity)\n- **Applications** — where the concept is used in practice\n\n**Example.** Consider a representative scenario from the module: applying the concept to a small instance shows how the invariants are preserved at every step, and how the final result satisfies the specification.\n\n**Conclusion.** For a full ${marks}-mark answer, present the definition, the mechanism with an example, the properties, and a short note on trade-offs. Cite the approved material for each major claim.`;

  const body = marks <= 2 ? shortBody : marks <= 5 ? mediumBody : longBody;

  const allSources: SourceRef[] = [
    { tag: "S1", document: `${subjectName} — Unit Notes.pdf`, location: "Page 42", preview: `"${capitalize(topic)} is formally defined as the property that ensures..."` },
    { tag: "S2", document: `${moduleName} Lecture Slides.pptx`, location: "Slide 17", preview: `"The mechanism proceeds in stages, each preserving the key invariant..."` },
    { tag: "S3", document: "Reference Textbook Ch. 6.pdf", location: "Page 118", preview: `"A worked example illustrates how the guarantee holds under concurrent access..."` },
  ];
  const sources = allSources.slice(0, marks <= 2 ? 1 : marks <= 5 ? 2 : 3);

  return {
    question,
    marks,
    subject: subjectName,
    module: moduleName,
    body,
    wordCount: body.split(/\s+/).length,
    processingMs: 600 + ((question.length * 7) % 900),
    sources,
  };
}

export function simplifyAnswer(answer: StudyAnswer): StudyAnswer {
  const simpleBody = `**In simple terms:** ${capitalize(answer.question.replace(/[?.]/g, "").trim())} means making sure the system does exactly what it promises — no surprises.\n\nThink of it like a checklist: each step is checked before moving on, so the final result is always trustworthy.\n\n- It has a clear job\n- It follows fixed rules\n- The outcome is reliable every time`;
  return {
    ...answer,
    body: simpleBody,
    wordCount: simpleBody.split(/\s+/).length,
    processingMs: 300 + ((answer.question.length * 5) % 500),
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
