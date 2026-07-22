import type {
  FinishSchedulerRunInput,
  LogPublishEventInput,
  SchedulerHealth,
} from "../types/reporting";

export async function startSchedulerRun(db: D1Database): Promise<number> {
  const startedAt = new Date().toISOString();
  const row = await db
    .prepare(`INSERT INTO scheduler_runs (started_at) VALUES (?) RETURNING id`)
    .bind(startedAt)
    .first<{ id: number }>();

  if (!row) {
    throw new Error("failed to start scheduler run");
  }

  return row.id;
}

export async function finishSchedulerRun(
  db: D1Database,
  runId: number,
  stats: FinishSchedulerRunInput,
): Promise<void> {
  await db
    .prepare(
      `UPDATE scheduler_runs
       SET finished_at = ?,
           due_count = ?,
           processed_count = ?,
           success_count = ?,
           failed_count = ?,
           recovered_count = ?
       WHERE id = ?`,
    )
    .bind(
      new Date().toISOString(),
      stats.dueCount,
      stats.processedCount,
      stats.successCount,
      stats.failedCount,
      stats.recoveredCount,
      runId,
    )
    .run();
}

export async function logPublishEvent(
  db: D1Database,
  input: LogPublishEventInput,
): Promise<void> {
  const attemptedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO publish_events
         (post_id, attempted_at, result, error_detail, linkedin_post_id, scheduler_run_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.postId,
      attemptedAt,
      input.result,
      input.errorDetail ?? null,
      input.linkedinPostId ?? null,
      input.schedulerRunId ?? null,
    )
    .run();
}

export async function getSchedulerHealth(db: D1Database): Promise<SchedulerHealth> {
  const lastRun = await db
    .prepare(
      `SELECT started_at, finished_at, due_count, processed_count,
              success_count, failed_count, recovered_count
       FROM scheduler_runs
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .first<{
      started_at: string;
      finished_at: string | null;
      due_count: number;
      processed_count: number;
      success_count: number;
      failed_count: number;
      recovered_count: number;
    }>();

  const totals = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN result = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM publish_events`,
    )
    .first<{ success: number | null; failed: number | null }>();

  const failedPosts = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM posts WHERE status = 'failed' AND deleted_at IS NULL`,
    )
    .first<{ count: number }>();

  return {
    last_run: lastRun
      ? {
          started_at: lastRun.started_at,
          finished_at: lastRun.finished_at,
          due_count: lastRun.due_count,
          processed_count: lastRun.processed_count,
          success_count: lastRun.success_count,
          failed_count: lastRun.failed_count,
          recovered_count: lastRun.recovered_count,
        }
      : null,
    publish_totals: {
      success: totals?.success ?? 0,
      failed: totals?.failed ?? 0,
    },
    failed_posts_count: failedPosts?.count ?? 0,
  };
}
