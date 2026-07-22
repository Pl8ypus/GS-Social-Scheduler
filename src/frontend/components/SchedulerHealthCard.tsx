import type { SchedulerHealth } from "../types/reporting";
import { formatScheduledAt } from "../utils/datetime";

type SchedulerHealthCardProps = {
  health: SchedulerHealth | null;
  isLoading: boolean;
};

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "failed" | "muted";
}) {
  return (
    <div className={`health-stat health-stat--${tone ?? "default"}`}>
      <span className="health-stat-label">{label}</span>
      <span className="health-stat-value">{value}</span>
    </div>
  );
}

export default function SchedulerHealthCard({
  health,
  isLoading,
}: SchedulerHealthCardProps) {
  if (isLoading) {
    return (
      <section className="card health-card" aria-label="Scheduler health">
        <p className="loading-state">Loading scheduler health…</p>
      </section>
    );
  }

  if (!health) {
    return null;
  }

  const lastRun = health.last_run;

  return (
    <section className="card health-card" aria-label="Scheduler health">
      <div className="health-card-header">
        <p className="form-section-label">Scheduler health</p>
        <p className="health-card-caption">
          Internal observability from publish events and cron runs — no external
          calls.
        </p>
      </div>

      <div className="health-grid">
        <StatBlock
          label="Last cron run"
          value={lastRun ? formatScheduledAt(lastRun.started_at) : "Never"}
        />
        <StatBlock
          label="Processed (last run)"
          value={lastRun?.processed_count ?? 0}
        />
        <StatBlock
          label="Success (last run)"
          value={lastRun?.success_count ?? 0}
          tone="success"
        />
        <StatBlock
          label="Failed (last run)"
          value={lastRun?.failed_count ?? 0}
          tone={lastRun && lastRun.failed_count > 0 ? "failed" : "default"}
        />
        <StatBlock
          label="All-time successes"
          value={health.publish_totals.success}
          tone="success"
        />
        <StatBlock
          label="All-time failures"
          value={health.publish_totals.failed}
          tone={health.publish_totals.failed > 0 ? "failed" : "default"}
        />
      </div>

      {lastRun && lastRun.recovered_count > 0 && (
        <p className="health-footnote">
          Last run recovered {lastRun.recovered_count} stuck publishing post
          {lastRun.recovered_count === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}
