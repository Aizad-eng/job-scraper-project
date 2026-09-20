import { formatDate } from "../helpers/formatHelpers.js";

const STATUS_LABEL = {
  done: "Sent",
  empty: "Nothing sent",
  failed: "Failed",
};

export default function RecentRuns({ runs, onOpen, onForget }) {
  if (!runs.length) return null;

  return (
    <section className="recent">
      <h2 className="recent-title">Recent runs</h2>
      <ul className="recent-list">
        {runs.map((run) => (
          <li key={run.jobId}>
            <button
              type="button"
              className="recent-item"
              onClick={() => onOpen(run.jobId)}
            >
              <span className="recent-main">
                <strong>{run.keywords?.join(", ") || run.jobId.slice(0, 8)}</strong>
                <em>
                  {run.location || "Anywhere"} · {run.platforms?.join(", ")}
                </em>
              </span>
              <span className="recent-meta">
                <span className={`pill is-${run.status || "running"}`}>
                  {STATUS_LABEL[run.status] || "In progress"}
                  {run.status === "done" && typeof run.sent === "number" ? ` · ${run.sent}` : ""}
                </span>
                <em>{formatDate(run.createdAt)}</em>
              </span>
            </button>
            <button
              type="button"
              className="recent-forget"
              onClick={() => onForget(run.jobId)}
              aria-label="Remove from list"
              title="Remove from list"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
