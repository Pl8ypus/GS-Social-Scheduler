export type SchedulerHealth = {
  last_run: {
    started_at: string;
    finished_at: string | null;
    due_count: number;
    processed_count: number;
    success_count: number;
    failed_count: number;
    recovered_count: number;
  } | null;
  publish_totals: {
    success: number;
    failed: number;
  };
  failed_posts_count: number;
};
