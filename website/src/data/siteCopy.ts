export const links = {
  site: "https://codetracr.com",
  github: "https://github.com/bkapilsharmadev/codetracr",
  githubProfile: "https://github.com/bkapilsharmadev",
  linkedin: "https://www.linkedin.com/in/brindaban-kapil-sharma-b12438123/",
  email: "mailto:hello@codetracr.com",
  emailLabel: "hello@codetracr.com",
  gettingStarted: "https://github.com/bkapilsharmadev/codetracr#quick-start",
  personal: "https://bkapilsharma.com",
  writing: "https://bytesjourney.com",
  ranktrix: "https://ranktrix.com",
} as const;

export const navItems = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#open-source", label: "Open source" },
  { href: "#contact", label: "Contact" },
] as const;

export const productNavItems = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#open-source", label: "Open source" },
] as const;

export const homepage = {
  hero: {
    eyebrow: "Public beta 0.1.0",
    title: "If you change a function, know what it actually touches.",
    description:
      "CodeTracr builds a semantic graph from source — not from runtime guesses — then lets you query lineage, blast radius, and traces in the browser.",
    annotation: "From change to real impact",
    primaryCta: { href: links.github, label: "View on GitHub" },
    secondaryCta: { href: links.gettingStarted, label: "Get started" },
  },
  features: {
    items: [
      {
        icon: "blast",
        title: "Blast radius",
        description: "See what's affected before you merge.",
      },
      {
        icon: "lineage",
        title: "Lineage",
        description: "Trace dependencies across services, DBs and events.",
      },
      {
        icon: "flow",
        title: "Flow & sequence",
        description: "Understand how the system actually executes.",
      },
      {
        icon: "source",
        title: "Source-backed",
        description: "Every link comes with source evidence.",
      },
    ],
  },
  why: {
    title: "Code changes have ripple effects.",
    description:
      "Edit OrderService.create and the blast is rarely just that file. It can reach the HTTP handler that calls it, the table it writes, the event it publishes, and the consumers waiting on the other side.",
    fileName: "OrderService.ts",
    impacts: [
      { icon: "api", label: "POST /api/v1/orders", kind: "HTTP" },
      { icon: "db", label: "orders", kind: "table" },
      { icon: "event", label: "OrderCreated", kind: "event" },
      { icon: "service", label: "InventoryService", kind: "consumer" },
      { icon: "service", label: "BillingService", kind: "consumer" },
    ],
  },
  how: {
    eyebrow: "How it works",
    title: "Source in. Graph out. Query in the browser.",
    steps: [
      {
        icon: "parse",
        title: "Parse & analyze",
        description: "Tree-sitter walks the source tree and extracts facts — no runtime required.",
      },
      {
        icon: "graph",
        title: "Build semantic graph",
        description: "Symbols, calls, and framework rules become a CodeTracr-owned graph.",
      },
      {
        icon: "query",
        title: "Query impact",
        description: "Explore lineage, flow, sequence, and blast radius in the browser.",
      },
      {
        icon: "confidence",
        title: "Change with confidence",
        description: "If a relationship cannot be proved, it stays unresolved — never guessed.",
      },
    ],
  },
  cta: {
    title: "A more understandable codebase is a more reliable system.",
    primaryCta: { href: links.github, label: "View on GitHub" },
    secondaryCta: { href: links.gettingStarted, label: "Get started" },
    signals: ["MIT licensed", "Community driven", "Fail-closed by design"],
  },
  contact: {
    eyebrow: "Contact",
    title: "Built in the open. Happy to talk.",
    blurb:
      "Questions, bugs, ideas, or just curious how the graph is built? I read every message.",
    founder: {
      name: "Kapil Sharma",
      role: "Founder & maintainer",
      photo: "/kapil-sharma.jpg",
    },
  },
} as const;

export const footerCopy = {
  tagline: "Understand code. Prevent surprises.",
  moreFromLabel: "More from Brindaban Kapil Sharma",
  moreFrom: [
    { href: links.personal, label: "bkapilsharma.com" },
    { href: links.writing, label: "bytesjourney.com" },
    { href: links.ranktrix, label: "RankTrix.com" },
  ],
} as const;
