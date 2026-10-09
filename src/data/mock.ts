/**
 * Learnora mock data layer.
 *
 * Phase 1 only: everything here is static. In later phases these functions
 * become the seam where real data fetching (server functions / DB) plugs in,
 * so UI components should always read through the exported helpers below
 * rather than importing raw arrays.
 */

export type Role = "student" | "instructor" | "admin";
export type Level = "Beginner" | "Intermediate" | "Advanced" | "All levels";
export type CourseStatus = "Published" | "Draft" | "Pending Review" | "Rejected";

export interface Category {
  id: string;
  slug: string;
  name: string;
  blurb: string;
  courseCount: number;
  icon: string;
}

export interface Instructor {
  id: string;
  name: string;
  initials: string;
  title: string;
  expertise: string[];
  rating: number;
  students: number;
  courses: number;
  reviews: number;
  bio: string;
  social: { label: string; href: string }[];
}

export interface Lesson {
  id: string;
  title: string;
  duration: string;
  preview?: boolean;
  locked?: boolean;
  completed?: boolean;
  description: string;
}

export interface CurriculumSection {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Review {
  id: string;
  author: string;
  initials: string;
  role: string;
  rating: number;
  date: string;
  course: string;
  body: string;
  status: "Published" | "Flagged" | "Pending";
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  categorySlug: string;
  category: string;
  instructorId: string;
  instructor: string;
  rating: number;
  reviewCount: number;
  students: number;
  durationHours: number;
  duration: string;
  level: Level;
  language: string;
  price: number;
  originalPrice?: number;
  updated: string;
  status: CourseStatus;
  revenue: number;
  description: string;
  outcomes: string[];
  requirements: string[];
  curriculum: CurriculumSection[];
  accent: string;
}

export const categories: Category[] = [
  {
    id: "c1",
    slug: "web-development",
    name: "Web Development",
    blurb: "Frontend to full-stack",
    courseCount: 64,
    icon: "Code2",
  },
  {
    id: "c2",
    slug: "programming",
    name: "Programming",
    blurb: "Languages and fundamentals",
    courseCount: 52,
    icon: "Terminal",
  },
  {
    id: "c3",
    slug: "data-science",
    name: "Data Science",
    blurb: "Statistics, Python, ML",
    courseCount: 41,
    icon: "LineChart",
  },
  {
    id: "c4",
    slug: "design",
    name: "UI / UX Design",
    blurb: "Research to design systems",
    courseCount: 38,
    icon: "PenTool",
  },
  {
    id: "c5",
    slug: "business",
    name: "Business",
    blurb: "Strategy and leadership",
    courseCount: 33,
    icon: "Briefcase",
  },
  {
    id: "c6",
    slug: "marketing",
    name: "Marketing",
    blurb: "Growth and analytics",
    courseCount: 27,
    icon: "Megaphone",
  },
  {
    id: "c7",
    slug: "cybersecurity",
    name: "Cybersecurity",
    blurb: "Defence and offence",
    courseCount: 29,
    icon: "ShieldCheck",
  },
  {
    id: "c8",
    slug: "mobile",
    name: "Mobile Development",
    blurb: "iOS, Android, React Native",
    courseCount: 24,
    icon: "Smartphone",
  },
];

export const instructors: Instructor[] = [
  {
    id: "i1",
    name: "Elena Vasquez",
    initials: "EV",
    title: "Principal Frontend Engineer, Meridian Labs",
    expertise: ["React", "TypeScript", "Design Systems"],
    rating: 4.8,
    students: 48210,
    courses: 6,
    reviews: 9420,
    bio: "Elena has spent twelve years building interface platforms for design-led product teams. She leads the frontend guild at Meridian Labs and writes about rendering performance and component API design.",
    social: [
      { label: "Website", href: "#" },
      { label: "GitHub", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
  },
  {
    id: "i2",
    name: "Dr. Amara Nwosu",
    initials: "AN",
    title: "Applied Statistician, Kepler Analytics",
    expertise: ["Statistics", "Python", "Causal Inference"],
    rating: 4.9,
    students: 31480,
    courses: 4,
    reviews: 6120,
    bio: "Amara holds a PhD in applied statistics and consults on experimentation programmes for consumer platforms. Her courses focus on reasoning correctly about uncertainty before reaching for a model.",
    social: [
      { label: "Website", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
  },
  {
    id: "i3",
    name: "Marcus Lindqvist",
    initials: "ML",
    title: "Design Systems Lead, Northlight",
    expertise: ["Design Systems", "Figma", "Accessibility"],
    rating: 4.7,
    students: 27890,
    courses: 5,
    reviews: 5310,
    bio: "Marcus builds and maintains the shared design language behind three enterprise products. He teaches the unglamorous parts of design systems: governance, versioning and adoption.",
    social: [
      { label: "Website", href: "#" },
      { label: "Dribbble", href: "#" },
    ],
  },
  {
    id: "i4",
    name: "Priya Nair",
    initials: "PN",
    title: "Staff Engineer, Cartogram",
    expertise: ["Node.js", "APIs", "Distributed Systems"],
    rating: 4.8,
    students: 22140,
    courses: 3,
    reviews: 4180,
    bio: "Priya designs the service layer for a mapping platform serving 40 million monthly requests. She teaches backend architecture through the failures she has personally shipped and repaired.",
    social: [{ label: "GitHub", href: "#" }],
  },
  {
    id: "i5",
    name: "Tomas Herrera",
    initials: "TH",
    title: "Security Engineer, Fieldstone",
    expertise: ["AppSec", "Threat Modelling", "Cloud"],
    rating: 4.6,
    students: 15620,
    courses: 3,
    reviews: 2870,
    bio: "Tomas runs red-team exercises for financial infrastructure clients and translates the findings into practical engineering habits.",
    social: [{ label: "LinkedIn", href: "#" }],
  },
  {
    id: "i6",
    name: "Sofia Bergman",
    initials: "SB",
    title: "Growth Director, Halvorsen & Co.",
    expertise: ["Growth", "Analytics", "Positioning"],
    rating: 4.7,
    students: 18930,
    courses: 4,
    reviews: 3410,
    bio: "Sofia has taken three B2B products from first customers to category leadership. She teaches marketing as a measurement discipline rather than a creative guess.",
    social: [{ label: "LinkedIn", href: "#" }],
  },
];

function section(
  id: string,
  title: string,
  lessons: [string, string, string, boolean?][],
): CurriculumSection {
  return {
    id,
    title,
    lessons: lessons.map(([lt, dur, desc, preview], idx) => ({
      id: `${id}-l${idx + 1}`,
      title: lt,
      duration: dur,
      description: desc,
      preview: Boolean(preview),
    })),
  };
}

const reactCurriculum: CurriculumSection[] = [
  section("s1", "Section 1 — Introduction", [
    [
      "Welcome to the course",
      "4:12",
      "How the course is structured and what you will build across the eight modules.",
      true,
    ],
    [
      "Course roadmap",
      "6:40",
      "A tour of the three projects and the skills each one exercises.",
      true,
    ],
    [
      "Setting up the environment",
      "11:05",
      "Node, package manager, editor configuration and the starter repository.",
    ],
  ]),
  section("s2", "Section 2 — Fundamentals", [
    [
      "Components and props in depth",
      "18:22",
      "Composition patterns, prop drilling and when to reach for context.",
    ],
    [
      "State, effects and the render cycle",
      "24:10",
      "A precise mental model of when React re-renders and why.",
    ],
    [
      "Typing components with TypeScript",
      "21:35",
      "Generics, discriminated unions and prop inference for reusable components.",
    ],
  ]),
  section("s3", "Section 3 — Data and Routing", [
    [
      "Client caching with TanStack Query",
      "26:48",
      "Query keys, invalidation and optimistic updates.",
    ],
    ["File-based routing patterns", "19:14", "Layouts, loaders and route-level data contracts."],
    ["Forms and validation", "22:02", "Schema-driven forms with accessible error handling."],
  ]),
  section("s4", "Section 4 — Advanced Concepts", [
    [
      "Rendering performance",
      "28:31",
      "Profiling, memoisation trade-offs and list virtualisation.",
    ],
    ["Design system integration", "17:55", "Tokens, variants and keeping components on-brand."],
    ["Capstone project", "42:18", "Ship a production-grade dashboard end to end."],
  ]),
];

const genericCurriculum = (topic: string): CurriculumSection[] => [
  section("s1", "Section 1 — Introduction", [
    ["Welcome and orientation", "5:20", `What ${topic} covers and who it is for.`, true],
    ["How to use this course", "6:02", "Pacing, exercises and the companion resources.", true],
    ["Setting up your workspace", "12:44", "Tooling installation and the starter files."],
  ]),
  section("s2", "Section 2 — Core Foundations", [
    ["The core concepts", "22:17", "The vocabulary and models the rest of the course builds on."],
    [
      "Working through your first example",
      "25:03",
      "A guided walkthrough with commentary on each decision.",
    ],
    [
      "Common mistakes and how to avoid them",
      "16:38",
      "Failure modes seen repeatedly in real teams.",
    ],
  ]),
  section("s3", "Section 3 — Applied Practice", [
    ["Case study: a real engagement", "29:51", "An anonymised project from start to delivery."],
    ["Building your own version", "34:12", "Hands-on project work with checkpoints."],
    ["Review and critique", "18:26", "How to evaluate your own output honestly."],
  ]),
  section("s4", "Section 4 — Going Further", [
    ["Scaling the approach to a team", "20:09", "Documentation, handover and shared standards."],
    ["Where to go next", "9:47", "Reading list, communities and follow-on courses."],
  ]),
];

export const courses: Course[] = [
  {
    id: "modern-react-typescript",
    title: "Modern React & TypeScript",
    subtitle:
      "Build production interfaces with confident types, clean state and measurable performance.",
    categorySlug: "web-development",
    category: "Web Development",
    instructorId: "i1",
    instructor: "Elena Vasquez",
    rating: 4.8,
    reviewCount: 2341,
    students: 12480,
    durationHours: 14.5,
    duration: "14h 30m",
    level: "Intermediate",
    language: "English",
    price: 49,
    originalPrice: 75,
    updated: "August 2026",
    status: "Published",
    revenue: 148320,
    description:
      "This course is a complete rebuild of how you write React. Rather than cataloguing APIs, it works through the decisions senior engineers make daily: where state belongs, how to type a component so misuse is impossible, and how to keep a growing interface fast. You will build three projects, each one introducing constraints that force better architecture.",
    outcomes: [
      "Model component state so bugs become unrepresentable",
      "Write generic, fully typed reusable components",
      "Profile and fix real rendering performance problems",
      "Structure data fetching with caching and invalidation",
      "Build accessible forms with schema-driven validation",
      "Ship a production-grade dashboard from scratch",
    ],
    requirements: [
      "Comfortable with JavaScript fundamentals and ES modules",
      "Some prior exposure to React (hooks, JSX)",
      "Node.js 20+ installed locally",
    ],
    curriculum: reactCurriculum,
    accent: "from-brand/30",
  },
  {
    id: "statistical-thinking",
    title: "Statistical Thinking & Inference",
    subtitle: "Reason correctly about uncertainty before you reach for a model.",
    categorySlug: "data-science",
    category: "Data Science",
    instructorId: "i2",
    instructor: "Dr. Amara Nwosu",
    rating: 4.9,
    reviewCount: 1876,
    students: 9214,
    durationHours: 22,
    duration: "22h 10m",
    level: "Advanced",
    language: "English",
    price: 59,
    originalPrice: 85,
    updated: "July 2026",
    status: "Published",
    revenue: 132990,
    description:
      "Most analytics failures are not modelling failures — they are reasoning failures. This course rebuilds statistical intuition from the ground up: sampling, estimation, hypothesis testing and the experimental designs that make causal claims defensible. Every module pairs theory with a Python notebook worked end to end.",
    outcomes: [
      "Choose the right estimator for a question",
      "Design and power an experiment properly",
      "Interpret confidence intervals without the usual errors",
      "Detect and correct for common sources of bias",
      "Communicate uncertainty to non-technical stakeholders",
      "Run a full analysis in Python from raw data to memo",
    ],
    requirements: [
      "Working knowledge of Python and pandas",
      "High-school level algebra",
      "Curiosity about why results replicate — or don't",
    ],
    curriculum: genericCurriculum("statistical inference"),
    accent: "from-good/25",
  },
  {
    id: "design-systems-that-scale",
    title: "Design Systems That Scale",
    subtitle: "Tokens, governance and adoption — the parts nobody teaches.",
    categorySlug: "design",
    category: "UI / UX Design",
    instructorId: "i3",
    instructor: "Marcus Lindqvist",
    rating: 4.7,
    reviewCount: 3052,
    students: 15730,
    durationHours: 9.75,
    duration: "9h 45m",
    level: "Beginner",
    language: "English",
    price: 39,
    originalPrice: 52,
    updated: "September 2026",
    status: "Published",
    revenue: 118420,
    description:
      "A design system is an organisational agreement wearing a component library as a disguise. This course covers the craft — tokens, variants, documentation — and the politics: how to get three product teams to actually adopt what you built, and how to version it once they do.",
    outcomes: [
      "Define a token architecture that survives rebrands",
      "Design component APIs that resist misuse",
      "Document components so they are actually used",
      "Run a contribution and review process",
      "Measure adoption across product teams",
      "Version and migrate breaking changes safely",
    ],
    requirements: [
      "Familiarity with Figma",
      "Basic understanding of CSS",
      "No coding experience required",
    ],
    curriculum: genericCurriculum("design systems"),
    accent: "from-gold/25",
  },
  {
    id: "api-design-in-practice",
    title: "API Design in Practice",
    subtitle: "Design service interfaces that clients enjoy and operators can run.",
    categorySlug: "programming",
    category: "Programming",
    instructorId: "i4",
    instructor: "Priya Nair",
    rating: 4.8,
    reviewCount: 1284,
    students: 8460,
    durationHours: 12.25,
    duration: "12h 15m",
    level: "Intermediate",
    language: "English",
    price: 54,
    originalPrice: 79,
    updated: "June 2026",
    status: "Published",
    revenue: 96240,
    description:
      "Built around a single evolving service, this course walks through resource modelling, pagination, versioning, idempotency and error contracts — then puts the API under load and shows what breaks. Every pattern is presented with the operational cost it carries.",
    outcomes: [
      "Model resources and relationships cleanly",
      "Design pagination and filtering that scales",
      "Handle idempotency and retries correctly",
      "Version an API without breaking clients",
      "Write error contracts clients can program against",
      "Instrument and load-test a service",
    ],
    requirements: [
      "Server-side experience in any language",
      "Comfort with HTTP basics",
      "A terminal",
    ],
    curriculum: genericCurriculum("API design"),
    accent: "from-brand-soft/25",
  },
  {
    id: "applied-cloud-security",
    title: "Applied Cloud Security",
    subtitle: "Threat modelling and hardening for teams shipping weekly.",
    categorySlug: "cybersecurity",
    category: "Cybersecurity",
    instructorId: "i5",
    instructor: "Tomas Herrera",
    rating: 4.6,
    reviewCount: 942,
    students: 6120,
    durationHours: 16.5,
    duration: "16h 30m",
    level: "Advanced",
    language: "English",
    price: 69,
    originalPrice: 99,
    updated: "August 2026",
    status: "Published",
    revenue: 84150,
    description:
      "Security work fails when it arrives as a checklist at the end of a project. This course teaches threat modelling as a design activity, then covers identity, secrets, network boundaries and incident readiness for cloud-native teams — with hands-on labs against a deliberately vulnerable stack.",
    outcomes: [
      "Run a threat modelling session with engineers",
      "Design least-privilege identity boundaries",
      "Manage secrets across environments safely",
      "Harden CI/CD pipelines against supply-chain attacks",
      "Build a workable incident response runbook",
      "Prioritise findings by real business risk",
    ],
    requirements: [
      "Cloud platform experience (AWS, GCP or Azure)",
      "Basic Linux and networking",
      "Comfort reading code",
    ],
    curriculum: genericCurriculum("cloud security"),
    accent: "from-destructive/20",
  },
  {
    id: "positioning-and-growth",
    title: "Positioning & Growth for B2B",
    subtitle: "Find the market that wants you, then build a measurable engine.",
    categorySlug: "marketing",
    category: "Marketing",
    instructorId: "i6",
    instructor: "Sofia Bergman",
    rating: 4.7,
    reviewCount: 1512,
    students: 10240,
    durationHours: 8.5,
    duration: "8h 30m",
    level: "All levels",
    language: "English",
    price: 44,
    originalPrice: 66,
    updated: "May 2026",
    status: "Published",
    revenue: 71360,
    description:
      "Growth without positioning is expensive noise. This course starts with segmentation and message testing, then builds the acquisition and retention loops on top — with a measurement framework that survives contact with a finance team.",
    outcomes: [
      "Segment a market and pick a beachhead",
      "Test messaging before spending on channels",
      "Build an acquisition loop with honest attribution",
      "Model CAC, payback and retention together",
      "Run a quarterly growth review that changes decisions",
      "Brief a team or agency without ambiguity",
    ],
    requirements: [
      "Some exposure to marketing or product",
      "Spreadsheet comfort",
      "No technical background needed",
    ],
    curriculum: genericCurriculum("B2B growth"),
    accent: "from-warn/20",
  },
  {
    id: "react-native-foundations",
    title: "React Native Foundations",
    subtitle: "One codebase, two platforms, no compromises the user notices.",
    categorySlug: "mobile",
    category: "Mobile Development",
    instructorId: "i1",
    instructor: "Elena Vasquez",
    rating: 4.6,
    reviewCount: 738,
    students: 5240,
    durationHours: 11,
    duration: "11h 00m",
    level: "Beginner",
    language: "English",
    price: 42,
    originalPrice: 60,
    updated: "April 2026",
    status: "Published",
    revenue: 44820,
    description:
      "A practical route into cross-platform mobile: navigation, native modules, gesture handling, offline storage and the release process for both stores. Built around a field-service app you will ship to a test track.",
    outcomes: [
      "Structure navigation for a multi-tab app",
      "Handle gestures and animation smoothly",
      "Persist data for offline-first usage",
      "Bridge to native modules when needed",
      "Prepare builds for both app stores",
      "Debug performance on real devices",
    ],
    requirements: [
      "JavaScript fundamentals",
      "A Mac or Windows machine",
      "Optional: a physical device for testing",
    ],
    curriculum: genericCurriculum("React Native"),
    accent: "from-brand/25",
  },
  {
    id: "product-strategy-essentials",
    title: "Product Strategy Essentials",
    subtitle: "Decide what not to build, and defend the decision.",
    categorySlug: "business",
    category: "Business",
    instructorId: "i6",
    instructor: "Sofia Bergman",
    rating: 4.5,
    reviewCount: 604,
    students: 4380,
    durationHours: 7.25,
    duration: "7h 15m",
    level: "All levels",
    language: "English",
    price: 38,
    updated: "March 2026",
    status: "Published",
    revenue: 32180,
    description:
      "Strategy is a set of hard trade-offs written down. This course gives you the frameworks and, more usefully, the worked examples of applying them under real constraints — limited headcount, an impatient board and incomplete data.",
    outcomes: [
      "Write a strategy document people can act on",
      "Prioritise with explicit trade-offs",
      "Run discovery that changes the roadmap",
      "Align stakeholders without endless meetings",
      "Set metrics that resist gaming",
      "Kill a project gracefully",
    ],
    requirements: ["Experience working on a product team", "No prior strategy training required"],
    curriculum: genericCurriculum("product strategy"),
    accent: "from-good/20",
  },
  {
    id: "advanced-css-architecture",
    title: "Advanced CSS Architecture",
    subtitle: "Layout systems, cascade layers and styling that stays maintainable.",
    categorySlug: "web-development",
    category: "Web Development",
    instructorId: "i3",
    instructor: "Marcus Lindqvist",
    rating: 4.8,
    reviewCount: 1120,
    students: 7310,
    durationHours: 10,
    duration: "10h 00m",
    level: "Intermediate",
    language: "English",
    price: 46,
    originalPrice: 64,
    updated: "September 2026",
    status: "Draft",
    revenue: 0,
    description:
      "Modern CSS has quietly become powerful enough to delete most of your tooling. This course covers container queries, cascade layers, subgrid and colour functions — and the architectural conventions that keep a large stylesheet legible after two years.",
    outcomes: [
      "Compose layouts with grid and subgrid",
      "Use container queries for genuinely modular components",
      "Organise the cascade deliberately with layers",
      "Build a colour system with modern colour functions",
      "Reduce specificity conflicts structurally",
      "Audit and refactor a legacy stylesheet",
    ],
    requirements: ["Solid CSS basics", "Familiarity with a component framework helps"],
    curriculum: genericCurriculum("CSS architecture"),
    accent: "from-brand-soft/20",
  },
  {
    id: "machine-learning-in-production",
    title: "Machine Learning in Production",
    subtitle: "From notebook to a service that survives Monday morning.",
    categorySlug: "data-science",
    category: "Data Science",
    instructorId: "i2",
    instructor: "Dr. Amara Nwosu",
    rating: 4.7,
    reviewCount: 486,
    students: 3120,
    durationHours: 18,
    duration: "18h 00m",
    level: "Advanced",
    language: "English",
    price: 72,
    originalPrice: 96,
    updated: "September 2026",
    status: "Pending Review",
    revenue: 0,
    description:
      "The distance between a good model and a reliable prediction service is mostly engineering. This course covers feature pipelines, training reproducibility, deployment topologies, monitoring for drift and the rollback plan you will eventually need.",
    outcomes: [
      "Build reproducible training pipelines",
      "Serve models with sensible latency budgets",
      "Monitor for data and concept drift",
      "Version datasets and models together",
      "Design safe rollout and rollback strategies",
      "Cost-model an inference workload",
    ],
    requirements: [
      "Comfortable training models in Python",
      "Basic Docker knowledge",
      "Some cloud exposure",
    ],
    curriculum: genericCurriculum("production ML"),
    accent: "from-good/20",
  },
  {
    id: "typography-for-interfaces",
    title: "Typography for Interfaces",
    subtitle: "Type as a system: scale, rhythm and legibility on screens.",
    categorySlug: "design",
    category: "UI / UX Design",
    instructorId: "i3",
    instructor: "Marcus Lindqvist",
    rating: 4.9,
    reviewCount: 812,
    students: 6890,
    durationHours: 6,
    duration: "6h 00m",
    level: "Beginner",
    language: "English",
    price: 34,
    originalPrice: 48,
    updated: "February 2026",
    status: "Published",
    revenue: 41280,
    description:
      "Typography is the fastest way to make an interface feel considered. This course builds a working type system: modular scales, optical adjustments, responsive line lengths and the accessibility floor you must not go below.",
    outcomes: [
      "Build a modular type scale that holds up",
      "Set line length and rhythm for reading comfort",
      "Pair typefaces with a rationale",
      "Handle variable fonts and performance",
      "Meet contrast and sizing accessibility rules",
      "Document type usage for a team",
    ],
    requirements: ["No prerequisites — suitable for designers and developers"],
    curriculum: genericCurriculum("interface typography"),
    accent: "from-gold/20",
  },
  {
    id: "python-fundamentals",
    title: "Python Fundamentals, Properly",
    subtitle: "A rigorous first course for people who intend to keep going.",
    categorySlug: "programming",
    category: "Programming",
    instructorId: "i4",
    instructor: "Priya Nair",
    rating: 4.7,
    reviewCount: 2210,
    students: 18640,
    durationHours: 13,
    duration: "13h 00m",
    level: "Beginner",
    language: "English",
    price: 32,
    originalPrice: 49,
    updated: "January 2026",
    status: "Published",
    revenue: 128940,
    description:
      "Most beginner courses teach syntax and stop. This one teaches the model underneath — objects, references, scope, iteration protocols — so that the second language you learn takes weeks instead of months.",
    outcomes: [
      "Understand Python's object and reference model",
      "Write idiomatic iteration and comprehension code",
      "Structure modules and packages sensibly",
      "Handle errors and resources correctly",
      "Test your code from the first week",
      "Read and navigate an unfamiliar codebase",
    ],
    requirements: ["No programming experience required", "A computer you can install software on"],
    curriculum: genericCurriculum("Python"),
    accent: "from-brand/20",
  },
];

export const reviews: Review[] = [
  {
    id: "r1",
    author: "Priya Nair",
    initials: "PN",
    role: "Staff Engineer, Meridian Labs",
    rating: 5,
    date: "12 Aug 2026",
    course: "Modern React & TypeScript",
    body: "The curriculum is rigorous without being dry. You ship real work and leave with a portfolio, not just a certificate. The pacing is genuinely respectful of your time.",
    status: "Published",
  },
  {
    id: "r2",
    author: "Daniel Okoro",
    initials: "DO",
    role: "Frontend Developer, Bellwether",
    rating: 5,
    date: "3 Aug 2026",
    course: "Modern React & TypeScript",
    body: "I finally understand why my components re-render. The performance module alone paid for the course three times over in the first sprint after I finished it.",
    status: "Published",
  },
  {
    id: "r3",
    author: "Hannah Reid",
    initials: "HR",
    role: "Data Analyst, Kepler",
    rating: 4,
    date: "28 Jul 2026",
    course: "Statistical Thinking & Inference",
    body: "Dense in the best way. I re-watched two modules and both times found something I had missed. Would have liked more exercises on observational data.",
    status: "Published",
  },
  {
    id: "r4",
    author: "Luis Moreau",
    initials: "LM",
    role: "Product Designer, Northlight",
    rating: 5,
    date: "19 Jul 2026",
    course: "Design Systems That Scale",
    body: "The governance section is the reason to take this. Everyone can build components; almost nobody explains how to get three teams to use them.",
    status: "Published",
  },
  {
    id: "r5",
    author: "Aisha Karim",
    initials: "AK",
    role: "Backend Engineer, Cartogram",
    rating: 4,
    date: "9 Jul 2026",
    course: "API Design in Practice",
    body: "Very practical. The idempotency chapter changed how we handle retries in our payment path. Audio in section three is slightly quiet.",
    status: "Flagged",
  },
  {
    id: "r6",
    author: "Jonas Wexler",
    initials: "JW",
    role: "Security Lead, Fieldstone",
    rating: 5,
    date: "1 Jul 2026",
    course: "Applied Cloud Security",
    body: "The threat modelling labs are excellent. We ran the same exercise with our own architecture the week after and found two real issues.",
    status: "Pending",
  },
];

export interface PlatformUser {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  status: "Active" | "Suspended" | "Pending";
  joined: string;
  enrollments: number;
}

export const users: PlatformUser[] = [
  {
    id: "u1",
    name: "Alex Mercer",
    initials: "AM",
    email: "alex.mercer@example.com",
    role: "student",
    status: "Active",
    joined: "14 Jan 2026",
    enrollments: 6,
  },
  {
    id: "u2",
    name: "Elena Vasquez",
    initials: "EV",
    email: "elena.vasquez@example.com",
    role: "instructor",
    status: "Active",
    joined: "2 Mar 2024",
    enrollments: 0,
  },
  {
    id: "u3",
    name: "Hannah Reid",
    initials: "HR",
    email: "hannah.reid@example.com",
    role: "student",
    status: "Active",
    joined: "21 Feb 2026",
    enrollments: 3,
  },
  {
    id: "u4",
    name: "Dr. Amara Nwosu",
    initials: "AN",
    email: "amara.nwosu@example.com",
    role: "instructor",
    status: "Active",
    joined: "9 Sep 2024",
    enrollments: 0,
  },
  {
    id: "u5",
    name: "Daniel Okoro",
    initials: "DO",
    email: "daniel.okoro@example.com",
    role: "student",
    status: "Active",
    joined: "4 Apr 2026",
    enrollments: 8,
  },
  {
    id: "u6",
    name: "Marcus Lindqvist",
    initials: "ML",
    email: "marcus.l@example.com",
    role: "instructor",
    status: "Active",
    joined: "17 Nov 2024",
    enrollments: 0,
  },
  {
    id: "u7",
    name: "Sofia Bergman",
    initials: "SB",
    email: "sofia.bergman@example.com",
    role: "instructor",
    status: "Pending",
    joined: "28 Aug 2026",
    enrollments: 0,
  },
  {
    id: "u8",
    name: "Luis Moreau",
    initials: "LM",
    email: "luis.moreau@example.com",
    role: "student",
    status: "Suspended",
    joined: "12 May 2026",
    enrollments: 2,
  },
  {
    id: "u9",
    name: "Aisha Karim",
    initials: "AK",
    email: "aisha.karim@example.com",
    role: "student",
    status: "Active",
    joined: "30 Jun 2026",
    enrollments: 5,
  },
  {
    id: "u10",
    name: "Nina Halvorsen",
    initials: "NH",
    email: "nina.h@example.com",
    role: "admin",
    status: "Active",
    joined: "1 Jan 2024",
    enrollments: 0,
  },
  {
    id: "u11",
    name: "Tomas Herrera",
    initials: "TH",
    email: "tomas.herrera@example.com",
    role: "instructor",
    status: "Active",
    joined: "5 Jul 2025",
    enrollments: 0,
  },
  {
    id: "u12",
    name: "Grace Whitfield",
    initials: "GW",
    email: "grace.w@example.com",
    role: "student",
    status: "Active",
    joined: "18 Aug 2026",
    enrollments: 4,
  },
];

export interface Enrollment {
  id: string;
  courseId: string;
  title: string;
  instructor: string;
  progress: number;
  lastLesson: string;
  enrolledOn: string;
  student: string;
  amount: number;
}

export const enrollments: Enrollment[] = [
  {
    id: "e1",
    courseId: "modern-react-typescript",
    title: "Modern React & TypeScript",
    instructor: "Elena Vasquez",
    progress: 67,
    lastLesson: "Rendering performance",
    enrolledOn: "2 Jul 2026",
    student: "Alex Mercer",
    amount: 49,
  },
  {
    id: "e2",
    courseId: "statistical-thinking",
    title: "Statistical Thinking & Inference",
    instructor: "Dr. Amara Nwosu",
    progress: 62,
    lastLesson: "Designing an experiment",
    enrolledOn: "18 Jun 2026",
    student: "Alex Mercer",
    amount: 59,
  },
  {
    id: "e3",
    courseId: "api-design-in-practice",
    title: "API Design in Practice",
    instructor: "Priya Nair",
    progress: 24,
    lastLesson: "Pagination strategies",
    enrolledOn: "11 Aug 2026",
    student: "Alex Mercer",
    amount: 54,
  },
  {
    id: "e4",
    courseId: "design-systems-that-scale",
    title: "Design Systems That Scale",
    instructor: "Marcus Lindqvist",
    progress: 100,
    lastLesson: "Course complete",
    enrolledOn: "3 Mar 2026",
    student: "Alex Mercer",
    amount: 39,
  },
  {
    id: "e5",
    courseId: "typography-for-interfaces",
    title: "Typography for Interfaces",
    instructor: "Marcus Lindqvist",
    progress: 100,
    lastLesson: "Course complete",
    enrolledOn: "22 Feb 2026",
    student: "Alex Mercer",
    amount: 34,
  },
  {
    id: "e6",
    courseId: "python-fundamentals",
    title: "Python Fundamentals, Properly",
    instructor: "Priya Nair",
    progress: 41,
    lastLesson: "Iteration protocols",
    enrolledOn: "9 Aug 2026",
    student: "Alex Mercer",
    amount: 32,
  },
];

export interface Certificate {
  id: string;
  title: string;
  course: string;
  issued: string;
  credentialId: string;
  student: string;
  hours: number;
}

export const certificates: Certificate[] = [
  {
    id: "cert1",
    title: "Certificate of Completion",
    course: "Design Systems That Scale",
    issued: "14 Jun 2026",
    credentialId: "LN-DS-2026-04821",
    student: "Alex Mercer",
    hours: 10,
  },
  {
    id: "cert2",
    title: "Certificate of Completion",
    course: "Typography for Interfaces",
    issued: "2 Apr 2026",
    credentialId: "LN-TY-2026-02194",
    student: "Alex Mercer",
    hours: 6,
  },
  {
    id: "cert3",
    title: "Certificate of Completion",
    course: "Product Strategy Essentials",
    issued: "27 Jan 2026",
    credentialId: "LN-PS-2026-00713",
    student: "Hannah Reid",
    hours: 7,
  },
];

export interface NotificationItemData {
  id: string;
  title: string;
  body: string;
  time: string;
  kind: "course" | "message" | "system" | "achievement";
  unread: boolean;
}

export const notifications: NotificationItemData[] = [
  {
    id: "n1",
    title: "New lesson published",
    body: 'Elena Vasquez added "Server components in depth" to Modern React & TypeScript.',
    time: "24 minutes ago",
    kind: "course",
    unread: true,
  },
  {
    id: "n2",
    title: "Marcus replied to your question",
    body: '"Good catch — the token naming changed in v3. Here\'s the migration note…"',
    time: "2 hours ago",
    kind: "message",
    unread: true,
  },
  {
    id: "n3",
    title: "Certificate issued",
    body: "Your certificate for Design Systems That Scale is ready to download.",
    time: "Yesterday",
    kind: "achievement",
    unread: false,
  },
  {
    id: "n4",
    title: "Weekly goal reached",
    body: "You studied 10 hours this week — your longest streak so far.",
    time: "2 days ago",
    kind: "achievement",
    unread: false,
  },
  {
    id: "n5",
    title: "Price drop on your wishlist",
    body: "Applied Cloud Security is now $69, down from $99.",
    time: "4 days ago",
    kind: "system",
    unread: false,
  },
];

export interface Conversation {
  id: string;
  name: string;
  initials: string;
  role: string;
  preview: string;
  time: string;
  unread: number;
  messages: { id: string; from: "me" | "them"; body: string; time: string }[];
}

export const conversations: Conversation[] = [
  {
    id: "cv1",
    name: "Elena Vasquez",
    initials: "EV",
    role: "Instructor · Modern React & TypeScript",
    preview: "That's expected — memoisation only helps when…",
    time: "10:24",
    unread: 2,
    messages: [
      {
        id: "m1",
        from: "me",
        body: "Quick question on section 4 — I wrapped my list rows in memo but the profiler still shows re-renders.",
        time: "09:58",
      },
      {
        id: "m2",
        from: "them",
        body: "That's expected — memoisation only helps when the props are referentially stable. Your row is probably receiving a new callback each render.",
        time: "10:22",
      },
      {
        id: "m3",
        from: "them",
        body: "Try hoisting the handler with useCallback and passing the row id as a data attribute instead. There's a worked example in the lesson repo under /examples/stable-rows.",
        time: "10:24",
      },
    ],
  },
  {
    id: "cv2",
    name: "Marcus Lindqvist",
    initials: "ML",
    role: "Instructor · Design Systems That Scale",
    preview: "Happy to review your token file if you share it.",
    time: "Yesterday",
    unread: 0,
    messages: [
      {
        id: "m1",
        from: "them",
        body: "Nice work on the capstone submission — your naming is consistent, which is the hard part.",
        time: "16:02",
      },
      {
        id: "m2",
        from: "me",
        body: "Thanks! I'm still unsure whether semantic tokens should reference primitives directly.",
        time: "16:40",
      },
      {
        id: "m3",
        from: "them",
        body: "Happy to review your token file if you share it.",
        time: "16:44",
      },
    ],
  },
  {
    id: "cv3",
    name: "Learnora Support",
    initials: "LS",
    role: "Platform team",
    preview: "Your invoice for August is available.",
    time: "28 Aug",
    unread: 0,
    messages: [
      {
        id: "m1",
        from: "them",
        body: "Your invoice for August is available in Settings → Billing.",
        time: "11:15",
      },
    ],
  },
];

export interface Payment {
  id: string;
  date: string;
  student: string;
  course: string;
  method: string;
  amount: number;
  status: "Completed" | "Refunded" | "Pending";
}

export const payments: Payment[] = [
  {
    id: "TX-20481",
    date: "1 Sep 2026",
    student: "Grace Whitfield",
    course: "Modern React & TypeScript",
    method: "Visa •••• 4242",
    amount: 49,
    status: "Completed",
  },
  {
    id: "TX-20477",
    date: "31 Aug 2026",
    student: "Aisha Karim",
    course: "API Design in Practice",
    method: "Mastercard •••• 8891",
    amount: 54,
    status: "Completed",
  },
  {
    id: "TX-20470",
    date: "30 Aug 2026",
    student: "Daniel Okoro",
    course: "Statistical Thinking & Inference",
    method: "PayPal",
    amount: 59,
    status: "Completed",
  },
  {
    id: "TX-20462",
    date: "29 Aug 2026",
    student: "Luis Moreau",
    course: "Design Systems That Scale",
    method: "Visa •••• 1104",
    amount: 39,
    status: "Refunded",
  },
  {
    id: "TX-20455",
    date: "28 Aug 2026",
    student: "Hannah Reid",
    course: "Python Fundamentals, Properly",
    method: "Visa •••• 7720",
    amount: 32,
    status: "Completed",
  },
  {
    id: "TX-20448",
    date: "27 Aug 2026",
    student: "Alex Mercer",
    course: "Applied Cloud Security",
    method: "Amex •••• 3009",
    amount: 69,
    status: "Pending",
  },
];

export interface Coupon {
  id: string;
  code: string;
  discount: string;
  applies: string;
  uses: number;
  limit: number;
  expires: string;
  status: "Active" | "Scheduled" | "Expired";
}

export const coupons: Coupon[] = [
  {
    id: "cp1",
    code: "AUTUMN30",
    discount: "30%",
    applies: "All courses",
    uses: 412,
    limit: 1000,
    expires: "30 Sep 2026",
    status: "Active",
  },
  {
    id: "cp2",
    code: "DATA20",
    discount: "20%",
    applies: "Data Science",
    uses: 188,
    limit: 500,
    expires: "15 Oct 2026",
    status: "Active",
  },
  {
    id: "cp3",
    code: "WELCOME10",
    discount: "$10",
    applies: "First purchase",
    uses: 2841,
    limit: 5000,
    expires: "31 Dec 2026",
    status: "Active",
  },
  {
    id: "cp4",
    code: "WINTER40",
    discount: "40%",
    applies: "All courses",
    uses: 0,
    limit: 800,
    expires: "1 Dec 2026",
    status: "Scheduled",
  },
  {
    id: "cp5",
    code: "SPRING25",
    discount: "25%",
    applies: "Design",
    uses: 634,
    limit: 700,
    expires: "31 May 2026",
    status: "Expired",
  },
];

export const revenueByMonth = [
  { month: "Mar", value: 18200 },
  { month: "Apr", value: 21400 },
  { month: "May", value: 19850 },
  { month: "Jun", value: 26700 },
  { month: "Jul", value: 31200 },
  { month: "Aug", value: 28900 },
  { month: "Sep", value: 36400 },
];

export const activity = [
  {
    id: "a1",
    text: 'Completed "Rendering performance" in Modern React & TypeScript',
    time: "1 hour ago",
  },
  { id: "a2", text: "Earned a certificate for Design Systems That Scale", time: "Yesterday" },
  {
    id: "a3",
    text: 'Started "Pagination strategies" in API Design in Practice',
    time: "2 days ago",
  },
  { id: "a4", text: "Added Applied Cloud Security to your wishlist", time: "4 days ago" },
  { id: "a5", text: "Posted a question in Statistical Thinking & Inference", time: "5 days ago" },
];

export const wishlistIds = [
  "applied-cloud-security",
  "machine-learning-in-production",
  "positioning-and-growth",
];

export const platformStats = {
  students: 10248,
  courses: 480,
  instructors: 112,
  lessonsCompleted: 52140,
  enrollments: 34820,
  revenue: 1284900,
};

/* ---------- accessors (future data-layer seam) ---------- */

export const getCourses = () => courses;
export const getPublishedCourses = () => courses.filter((c) => c.status === "Published");
export const getCourse = (id: string) => courses.find((c) => c.id === id);
export const getFeaturedCourses = () => getPublishedCourses().slice(0, 6);
export const getCategories = () => categories;
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const getInstructor = (id: string) => instructors.find((i) => i.id === id);
export const getInstructors = () => instructors;
export const getCoursesByInstructor = (id: string) => courses.filter((c) => c.instructorId === id);
export const getReviewsForCourse = (title: string) => reviews.filter((r) => r.course === title);
export const getWishlist = () => courses.filter((c) => wishlistIds.includes(c.id));
export const getEnrollments = () => enrollments;
export const getStudents = () => users.filter((u) => u.role === "student");
export const getInstructorUsers = () => users.filter((u) => u.role === "instructor");

export const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const compact = (n: number) => n.toLocaleString("en-US");
