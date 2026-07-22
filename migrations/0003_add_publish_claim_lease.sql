-- H2: lease timestamp so the recovery path can atomically re-claim a stuck
-- `publishing` post (compare-and-set on this value) instead of re-publishing it
-- from every concurrent scheduler run.
ALTER TABLE posts ADD COLUMN publish_claim_at TEXT;
