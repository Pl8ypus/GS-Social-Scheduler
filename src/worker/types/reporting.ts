export type PublishEventResult = "success" | "failed";

export type PublishEvent = {
  id: number;
  post_id: number;
  attempted_at: string;
  result: PublishEventResult;
  error_detail: string | null;
  linkedin_post_id: string | null;
  scheduler_run_id: number | null;
};

export type SchedulerRun = {
  id: number;
  started_at: string;
  finished_at: string | null;
  due_count: number;
  processed_count: number;
  success_count: number;
  failed_count: number;
  recovered_count: number;
};

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

export type LogPublishEventInput = {
  postId: number;
  result: PublishEventResult;
  schedulerRunId?: number;
  linkedinPostId?: string;
  errorDetail?: string;
};

export type FinishSchedulerRunInput = {
  dueCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  recoveredCount: number;
};
