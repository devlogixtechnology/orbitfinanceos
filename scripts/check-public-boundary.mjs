import { execFileSync } from "node:child_process";

const mode = process.argv[2] ?? "--tracked";
if (mode !== "--tracked" && mode !== "--staged") {
  console.error("Usage: node scripts/check-public-boundary.mjs [--tracked|--staged]");
  process.exit(2);
}

const privateFiles = new Set([
  ".github/copilot-instructions.md",
  "AGENTS.md",
  "AI_CONTEXT.md",
  "Agent.md",
  "CLAUDE.md",
  "GEMINI.md",
  "MEMORY.md",
  "docs/SOURCE_ANALYSIS.md",
  "instructions.md",
]);

const args =
  mode === "--staged"
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
    : ["ls-files"];

const output = execFileSync("git", args, { encoding: "utf8" });
const paths = output
  .split(/\r?\n/u)
  .map((path) => path.replaceAll("\\", "/"))
  .filter(Boolean);

const violations = paths.filter(
  (path) =>
    path === ".agents" ||
    path.startsWith(".agents/") ||
    path.toLowerCase().endsWith(".pdf") ||
    privateFiles.has(path),
);

if (violations.length > 0) {
  console.error("Private files are present in the public Git boundary:");
  for (const path of violations) {
    console.error(`- ${path}`);
  }
  console.error("Remove them from the index before committing or pushing.");
  process.exit(1);
}

console.log(`Public-boundary check passed for ${paths.length} ${mode.slice(2)} files.`);
