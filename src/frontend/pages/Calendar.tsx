import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { previewContent, type Post } from "../types/post";
import {
  APP_TIME_ZONE,
  APP_TIME_ZONE_LABEL,
  currentLisbonMonth,
  dateKey,
  formatTime,
  plainDateKey,
} from "../utils/datetime";

type CalendarDay = {
  date: Date;
  key: string;
  isCurrentMonth: boolean;
  isToday: boolean;
};

async function fetchPosts(): Promise<Post[]> {
  const response = await fetch("/api/posts");

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load posts (${response.status})`);
  }

  const data = (await response.json()) as { posts: Post[] };
  return data.posts;
}

function monthLabel(month: Date): string {
  const middleOfMonth = new Date(
    Date.UTC(month.getFullYear(), month.getMonth(), 15, 12),
  );

  return middleOfMonth.toLocaleDateString(undefined, {
    timeZone: APP_TIME_ZONE,
    month: "long",
    year: "numeric",
  });
}

function buildCalendarDays(month: Date): CalendarDay[] {
  const todayKey = dateKey(new Date());
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstGridDate = new Date(firstOfMonth);
  firstGridDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDate);
    date.setDate(firstGridDate.getDate() + index);
    const key = plainDateKey(date.getFullYear(), date.getMonth(), date.getDate());

    return {
      date,
      key,
      isCurrentMonth: date.getMonth() === month.getMonth(),
      isToday: key === todayKey,
    };
  });
}

export default function Calendar() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(currentLisbonMonth);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPosts() {
      setIsLoading(true);
      setError("");

      try {
        const loaded = await fetchPosts();
        if (isMounted) setPosts(loaded);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load posts.");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  );

  const scheduledPostsByDay = useMemo(() => {
    const groups = new Map<string, Post[]>();

    for (const post of posts) {
      if (post.status !== "scheduled" || !post.scheduled_at) continue;
      const key = dateKey(new Date(post.scheduled_at));
      const dayPosts = groups.get(key) ?? [];
      dayPosts.push(post);
      groups.set(key, dayPosts);
    }

    for (const dayPosts of groups.values()) {
      dayPosts.sort((a, b) =>
        (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""),
      );
    }

    return groups;
  }, [posts]);

  const visibleScheduledCount = calendarDays.reduce(
    (count, day) => count + (scheduledPostsByDay.get(day.key)?.length ?? 0),
    0,
  );

  function moveMonth(delta: number) {
    setVisibleMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  function showToday() {
    setVisibleMonth(currentLisbonMonth());
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <p className="page-eyebrow">Calendar</p>
            <h1 className="page-title">Scheduled posts</h1>
            <p className="page-description">
              Month view for posts currently scheduled to publish in {APP_TIME_ZONE_LABEL}.
            </p>
          </div>
          <Link to="/compose" className="btn btn--primary">
            Compose a post
          </Link>
        </div>
      </header>

      <section className="card calendar-card" aria-label="Scheduled posts calendar">
        <div className="calendar-toolbar">
          <div>
            <p className="form-section-label">Month view</p>
            <h2 className="calendar-title">{monthLabel(visibleMonth)}</h2>
          </div>
          <div className="calendar-actions">
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => moveMonth(-1)}
            >
              Previous
            </button>
            <button className="btn btn--ghost btn--sm" type="button" onClick={showToday}>
              Today
            </button>
            <button
              className="btn btn--ghost btn--sm"
              type="button"
              onClick={() => moveMonth(1)}
            >
              Next
            </button>
          </div>
        </div>

        {isLoading && <p className="loading-state">Loading scheduled posts…</p>}
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        {!isLoading && !error && visibleScheduledCount === 0 && (
          <p className="empty-state">
            No scheduled posts in {monthLabel(visibleMonth)}.
          </p>
        )}

        {!isLoading && !error && (
          <div className="calendar-grid" role="grid" aria-label={monthLabel(visibleMonth)}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <div className="calendar-weekday" key={weekday} role="columnheader">
                {weekday}
              </div>
            ))}

            {calendarDays.map((day) => {
              const dayPosts = scheduledPostsByDay.get(day.key) ?? [];

              return (
                <div
                  className={[
                    "calendar-day",
                    day.isCurrentMonth ? "" : "calendar-day--outside",
                    day.isToday ? "calendar-day--today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={day.key}
                  role="gridcell"
                >
                  <div className="calendar-day__header">
                    <span>{day.date.getDate()}</span>
                    {day.isToday && <span className="calendar-today-badge">Today</span>}
                  </div>

                  <div className="calendar-day__posts">
                    {dayPosts.map((post) => (
                      <Link
                        className="calendar-post"
                        key={post.id}
                        to={`/posts/${post.id}/edit`}
                        title={post.content}
                      >
                        <span className="calendar-post__time">
                          {formatTime(post.scheduled_at ?? "")}
                        </span>
                        <span className="calendar-post__content">
                          {previewContent(post.content, 48)}
                        </span>
                        <StatusBadge status={post.status} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
