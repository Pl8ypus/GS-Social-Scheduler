import type { Post } from "../types/post";
import { POST_COLUMNS } from "../routes/api/posts-utils";
import {
  finishSchedulerRun,
  logPublishEvent,
  startSchedulerRun,
} from "../services/reporting-service";

export type PublishExecutor = (
  linkedinPostId: string,
  post: Post,
) => Promise<string | void>;

/**
 * How long a `publishing` claim is considered live. A row still `publishing`
 * after this window is assumed to belong to a crashed run and becomes eligible
 * for atomic re-claim by the recovery path.
 */
const PUBLISH_LEASE_MS = 3 * 60 * 1000;

/** Generic, client-safe failure message (real error is logged server-side). */
const GENERIC_PUBLISH_ERROR = "Publish failed";

type StuckPost = Post & { publish_claim_at: string | null };

type RunContext = {
  runId: number;
};

const defaultPublishExecutor: PublishExecutor = async (_claimId, post) => {
  return buildMockLinkedinPostId(post.id);
};

export function buildPublishClaimId(postId: number): string {
  return `claim-${postId}-${crypto.randomUUID()}`;
}

export function buildMockLinkedinPostId(postId: number): string {
  return `mock-${postId}-${crypto.randomUUID()}`;
}

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Atomically claim a scheduled post before calling the publish API. */
export async function claimPostForPublish(
  db: D1Database,
  post: Post,
  linkedinPostId: string,
  claimedAt: string = new Date().toISOString(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE posts
       SET status = 'publishing', linkedin_post_id = ?, error_message = NULL,
           publish_claim_at = ?
       WHERE id = ? AND status = 'scheduled'`,
    )
    .bind(linkedinPostId, claimedAt, post.id)
    .run();

  return result.meta.changes === 1;
}

/**
 * Atomically re-claim a stuck `publishing` post via compare-and-set on its
 * lease timestamp. Only one concurrent runner can win a given row, mirroring
 * the scheduled -> publishing claim on the main path.
 */
export async function reclaimStuckPost(
  db: D1Database,
  post: StuckPost,
  claimedAt: string = new Date().toISOString(),
): Promise<boolean> {
  const previous = post.publish_claim_at;

  const statement =
    previous === null
      ? db
          .prepare(
            `UPDATE posts
             SET publish_claim_at = ?
             WHERE id = ? AND status = 'publishing' AND publish_claim_at IS NULL`,
          )
          .bind(claimedAt, post.id)
      : db
          .prepare(
            `UPDATE posts
             SET publish_claim_at = ?
             WHERE id = ? AND status = 'publishing' AND publish_claim_at = ?`,
          )
          .bind(claimedAt, post.id, previous);

  const result = await statement.run();
  return result.meta.changes === 1;
}

/** Finalize a claimed post after a successful publish call. */
export async function completePublish(
  db: D1Database,
  postId: number,
  linkedinPostId: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE posts
       SET status = 'posted', linkedin_post_id = ?, error_message = NULL
       WHERE id = ? AND status = 'publishing'`,
    )
    .bind(linkedinPostId, postId)
    .run();

  return result.meta.changes === 1;
}

export async function markPostFailed(
  db: D1Database,
  id: number,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE posts
       SET status = 'failed', error_message = ?
       WHERE id = ? AND status IN ('scheduled', 'publishing')`,
    )
    .bind(errorMessage, id)
    .run();
}

async function getStuckPublishingPosts(db: D1Database): Promise<StuckPost[]> {
  // Only rows whose lease has expired (or was never stamped) are eligible, so a
  // post actively being published by a live run is left alone.
  const leaseCutoff = new Date(Date.now() - PUBLISH_LEASE_MS).toISOString();
  const { results } = await db
    .prepare(
      `SELECT ${POST_COLUMNS}, publish_claim_at
       FROM posts
       WHERE status = 'publishing' AND linkedin_post_id IS NOT NULL
         AND deleted_at IS NULL
         AND (publish_claim_at IS NULL OR publish_claim_at <= ?)
       ORDER BY id ASC`,
    )
    .bind(leaseCutoff)
    .all<StuckPost>();

  return results ?? [];
}

async function getDueScheduledPosts(db: D1Database, now: string): Promise<Post[]> {
  const { results } = await db
    .prepare(
      `SELECT ${POST_COLUMNS}
       FROM posts
       WHERE status = 'scheduled' AND scheduled_at <= ?
         AND deleted_at IS NULL
       ORDER BY scheduled_at ASC, id ASC`,
    )
    .bind(now)
    .all<Post>();

  return results ?? [];
}

/** Resume posts stuck in `publishing` after a prior crash (idempotent complete). */
export async function recoverPublishingPosts(
  db: D1Database,
  publish: PublishExecutor = defaultPublishExecutor,
  run?: RunContext,
): Promise<number> {
  const stuck = await getStuckPublishingPosts(db);
  let recovered = 0;

  for (const post of stuck) {
    // Atomic claim: if another concurrent run already took this row, skip it so
    // the publish side effect only ever fires once.
    const claimed = await reclaimStuckPost(db, post);
    if (!claimed) {
      continue;
    }

    const linkedinPostId = post.linkedin_post_id!;
    try {
      const publishedId = (await publish(linkedinPostId, post)) ?? linkedinPostId;
      const completed = await completePublish(db, post.id, publishedId);
      if (completed) {
        recovered += 1;
        await logPublishEvent(db, {
          postId: post.id,
          result: "success",
          linkedinPostId: publishedId,
          schedulerRunId: run?.runId,
        });
        console.log(
          `[scheduler] Recovered post id=${post.id} linkedin_post_id=${publishedId}`,
        );
      }
    } catch (error) {
      const errorDetail = formatErrorDetail(error);
      console.error(`[scheduler] Recovery failed post id=${post.id}:`, error);
      await markPostFailed(db, post.id, GENERIC_PUBLISH_ERROR);
      await logPublishEvent(db, {
        postId: post.id,
        result: "failed",
        errorDetail,
        linkedinPostId,
        schedulerRunId: run?.runId,
      });
    }
  }

  return recovered;
}

export async function publishDuePost(
  db: D1Database,
  post: Post,
  publish: PublishExecutor = defaultPublishExecutor,
  linkedinPostId = buildPublishClaimId(post.id),
  run?: RunContext,
): Promise<string> {
  const claimed = await claimPostForPublish(db, post, linkedinPostId);
  if (!claimed) {
    throw new Error("post was not in scheduled status");
  }

  try {
    linkedinPostId = (await publish(linkedinPostId, post)) ?? linkedinPostId;
  } catch (error) {
    const errorDetail = formatErrorDetail(error);
    console.error(`[scheduler] Publish failed post id=${post.id}:`, error);
    await markPostFailed(db, post.id, GENERIC_PUBLISH_ERROR);
    await logPublishEvent(db, {
      postId: post.id,
      result: "failed",
      errorDetail,
      linkedinPostId,
      schedulerRunId: run?.runId,
    });
    throw error;
  }

  const completed = await completePublish(db, post.id, linkedinPostId);
  if (!completed) {
    throw new Error("failed to mark post as posted after publish");
  }

  await logPublishEvent(db, {
    postId: post.id,
    result: "success",
    linkedinPostId,
    schedulerRunId: run?.runId,
  });

  return linkedinPostId;
}

export async function processDuePosts(
  db: D1Database,
  publish: PublishExecutor = defaultPublishExecutor,
): Promise<void> {
  const runId = await startSchedulerRun(db);
  const run: RunContext = { runId };

  const now = new Date().toISOString();
  let successCount = 0;
  let failedCount = 0;

  const recovered = await recoverPublishingPosts(db, publish, run);
  if (recovered > 0) {
    console.log(`[scheduler] Recovered ${recovered} stuck publishing post(s)`);
    successCount += recovered;
  }

  const duePosts = await getDueScheduledPosts(db, now);
  console.log(`[scheduler] Found ${duePosts.length} due post(s) at ${now}`);

  for (const post of duePosts) {
    try {
      const linkedinPostId = await publishDuePost(db, post, publish, undefined, run);
      successCount += 1;
      console.log(
        `[scheduler] Posted post id=${post.id} linkedin_post_id=${linkedinPostId}`,
      );
    } catch (error) {
      failedCount += 1;
      console.error(`[scheduler] Failed post id=${post.id}:`, error);
    }
  }

  await finishSchedulerRun(db, runId, {
    dueCount: duePosts.length,
    processedCount: duePosts.length + recovered,
    successCount,
    failedCount,
    recoveredCount: recovered,
  });

  console.log("[scheduler] Run complete");
}
