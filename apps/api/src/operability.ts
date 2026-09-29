export type DependencyStatus = "degraded" | "ok" | "unavailable";

export interface ReadinessCheck {
  readonly check: () => Promise<"degraded" | "ok">;
  readonly name: "database" | "object_store" | "providers";
  readonly timeoutMilliseconds?: number;
}

export interface ReadinessResult {
  readonly checks: readonly {
    readonly name: ReadinessCheck["name"];
    readonly status: DependencyStatus;
  }[];
  readonly status: "not_ready" | "ready";
}

async function withTimeout<T>(operation: Promise<T>, timeoutMilliseconds: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Dependency readiness check timed out")),
          timeoutMilliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function evaluateReadiness(
  checks: readonly ReadinessCheck[],
  defaultTimeoutMilliseconds = 3_000,
): Promise<ReadinessResult> {
  const results = await Promise.all(
    checks.map(async (dependency) => {
      try {
        const result = await withTimeout(
          dependency.check(),
          dependency.timeoutMilliseconds ?? defaultTimeoutMilliseconds,
        );
        return {
          name: dependency.name,
          status: result,
        };
      } catch {
        return { name: dependency.name, status: "unavailable" as const };
      }
    }),
  );

  return {
    checks: results,
    status: results.some((result) => result.status === "unavailable")
      ? "not_ready"
      : "ready",
  };
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

export class OperabilityMetrics {
  private readonly dependencyFailures = new Map<string, number>();
  private readonly dependencyStatuses = new Map<string, DependencyStatus>();
  private readonly requests = new Map<string, { count: number; durationMilliseconds: number }>();

  recordDependency(name: string, status: DependencyStatus): void {
    this.dependencyStatuses.set(name, status);
    if (status === "unavailable") {
      this.dependencyFailures.set(name, (this.dependencyFailures.get(name) ?? 0) + 1);
    }
  }

  recordRequest(method: string, route: string, statusCode: number, durationMilliseconds: number): void {
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const key = [method.toUpperCase(), route, statusClass].join("\u001f");
    const current = this.requests.get(key) ?? { count: 0, durationMilliseconds: 0 };
    this.requests.set(key, {
      count: current.count + 1,
      durationMilliseconds: current.durationMilliseconds + Math.max(0, durationMilliseconds),
    });
  }

  render(): string {
    const lines = [
      "# HELP orbitos_http_requests_total HTTP requests completed by route and status class.",
      "# TYPE orbitos_http_requests_total counter",
      "# HELP orbitos_http_request_duration_milliseconds_sum Total HTTP request duration in milliseconds.",
      "# TYPE orbitos_http_request_duration_milliseconds_sum counter",
    ];

    for (const [key, value] of [...this.requests].sort(([left], [right]) => left.localeCompare(right))) {
      const [method = "UNKNOWN", route = "unmatched", statusClass = "unknown"] = key.split("\u001f");
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_class="${escapeLabel(statusClass)}"`;
      lines.push(`orbitos_http_requests_total{${labels}} ${value.count}`);
      lines.push(`orbitos_http_request_duration_milliseconds_sum{${labels}} ${value.durationMilliseconds.toFixed(3)}`);
    }

    lines.push(
      "# HELP orbitos_dependency_ready Whether a required dependency is available (1) or unavailable (0).",
      "# TYPE orbitos_dependency_ready gauge",
      "# HELP orbitos_dependency_degraded Whether a dependency is operating with reduced redundancy.",
      "# TYPE orbitos_dependency_degraded gauge",
      "# HELP orbitos_dependency_check_failures_total Failed dependency readiness checks.",
      "# TYPE orbitos_dependency_check_failures_total counter",
    );
    for (const [name, status] of [...this.dependencyStatuses].sort(([left], [right]) => left.localeCompare(right))) {
      const label = `dependency="${escapeLabel(name)}"`;
      lines.push(`orbitos_dependency_ready{${label}} ${status === "unavailable" ? 0 : 1}`);
      lines.push(`orbitos_dependency_degraded{${label}} ${status === "degraded" ? 1 : 0}`);
      lines.push(`orbitos_dependency_check_failures_total{${label}} ${this.dependencyFailures.get(name) ?? 0}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
