import { execFileSync } from "node:child_process";
import { readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const detectors = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/u,
  },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/u },
  { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/u },
  { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/u },
  { name: "Stripe live secret", pattern: /sk_live_[A-Za-z0-9]{16,}/u },
];

export function detectSecrets(content) {
  return detectors
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => name);
}

function repositoryFiles(mode) {
  const argumentsList =
    mode === "--worktree"
      ? ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]
      : mode === "--staged"
        ? ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]
        : ["ls-files", "-z"];
  return execFileSync("git", argumentsList, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function scan(paths) {
  const findings = [];
  for (const path of paths) {
    if (statSync(path).size > 1_000_000) {
      continue;
    }

    const content = readFileSync(path, "utf8");
    for (const detector of detectSecrets(content)) {
      findings.push({ detector, path });
    }
  }
  return findings;
}

function selfTest() {
  const fixturePath = join(tmpdir(), `orbitos-secret-scan-${process.pid}.txt`);
  const seededCredential = `AKIA${"0".repeat(16)}`;
  try {
    writeFileSync(fixturePath, seededCredential, { encoding: "utf8", mode: 0o600 });
    const findings = scan([fixturePath]);
    if (findings.length !== 1 || findings[0]?.detector !== "AWS access key") {
      throw new Error("Secret scanner did not detect the seeded credential fixture");
    }
  } finally {
    unlinkSync(fixturePath);
  }
  console.log("Secret-scanner self-test passed.");
}

const mode = process.argv[2] ?? "--tracked";
if (mode === "--self-test") {
  selfTest();
} else if (
  mode === "--tracked" ||
  mode === "--worktree" ||
  mode === "--staged"
) {
  const findings = scan(repositoryFiles(mode));
  if (findings.length > 0) {
    console.error("Potential credentials detected in repository files:");
    for (const finding of findings) {
      console.error(`- ${finding.path}: ${finding.detector}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Secret scan passed for ${mode === "--worktree" ? "tracked and untracked worktree" : mode.slice(2)} files.`,
    );
  }
} else {
  console.error(
    "Usage: node scripts/check-secrets.mjs [--tracked|--worktree|--staged|--self-test]",
  );
  process.exitCode = 2;
}
