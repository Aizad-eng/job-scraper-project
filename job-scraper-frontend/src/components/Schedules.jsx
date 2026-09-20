import { useEffect, useState, useCallback } from "react";
import BulkEditor from "./BulkEditor.jsx";
import {
  listSchedules,
  updateSchedule,
  deleteSchedule,
  runScheduleNow,
  resetScheduleSent,
  bulkUpdateSchedules,
} from "../helpers/apiHelpers.js";
import { formatDateTime, formatUntil } from "../helpers/formatHelpers.js";
import { SCHEDULES_REFRESH_MS } from "../constants/scheduleConstants.js";

const RUN_PILL = {
  done: "is-done",
  failed: "is-failed",
  empty: "",
};

const runLabel = (run) => {
  if (run.status === "done") return `Sent ${run.sent}${run.failed ? ` · ${run.failed} failed` : ""}`;
  if (run.status === "empty") return "Nothing new";
  if (run.status === "failed") return "Failed";
  return run.statusLabel || "Running";
};

export default function Schedules({ onOpenRun, onEdit, onNew, flash }) {
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await listSchedules();
      setSchedules(data.schedules);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    // first load is deferred a tick so it is not a synchronous setState in the effect
    const first = setTimeout(load, 0);
    const timer = setInterval(load, SCHEDULES_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const withBusy = async (id, action) => {
    setBusy((prev) => ({ ...prev, [id]: true }));
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  const toggle = (schedule) =>
    withBusy(schedule.scheduleId, () =>
      updateSchedule(schedule.scheduleId, { enabled: !schedule.enabled }),
    );

  // ---- selection + bulk ----
  const ids = (schedules || []).map((s) => s.scheduleId);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectWhere = (predicate) =>
    setSelected(new Set((schedules || []).filter(predicate).map((s) => s.scheduleId)));

  const runBulk = async (payload, describe) => {
    setBulkBusy(true);
    setError("");
    try {
      const result = await bulkUpdateSchedules({ scheduleIds: [...selected], ...payload });
      const failedNote = result.failed?.length
        ? ` ${result.failed.length} failed: ${result.failed.map((f) => `${f.name || f.scheduleId.slice(0, 8)} (${f.error})`).join("; ")}`
        : "";
      setNotice(`${describe(result.updated)}.${failedNote}`);
      if (payload.action === "delete") setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkAction = (action) => {
    const n = selected.size;
    if (!n) return;
    if (action === "delete" && !window.confirm(`Delete ${n} ${n === 1 ? "schedule" : "schedules"}? Past runs are kept.`)) return;
    if (action === "run" && !window.confirm(`Start ${n} ${n === 1 ? "search" : "searches"} now?`)) return;
    const verbs = { pause: "Paused", resume: "Resumed", run: "Started", delete: "Deleted" };
    runBulk({ action }, (count) => `${verbs[action]} ${count} ${count === 1 ? "schedule" : "schedules"}`);
  };

  const bulkApply = ({ inputs, schedule }) =>
    runBulk({ inputs, schedule }, (count) => `Updated ${count} ${count === 1 ? "schedule" : "schedules"}`).then(() =>
      setShowBulk(false),
    );

  const runNow = (schedule) =>
    withBusy(schedule.scheduleId, async () => {
      const result = await runScheduleNow(schedule.scheduleId);
      onOpenRun(result.jobId);
    });

  const remove = (schedule) => {
    if (!window.confirm(`Delete "${schedule.name || schedule.inputs.keywords.join(", ")}"? Past runs are kept.`)) return;
    withBusy(schedule.scheduleId, () => deleteSchedule(schedule.scheduleId));
  };

  const forgetSent = (schedule) => {
    if (!window.confirm("Forget everything this schedule has sent? The next run will send all matches again.")) return;
    withBusy(schedule.scheduleId, () => resetScheduleSent(schedule.scheduleId));
  };

  return (
    <div className="panel">
      <header className="panel-head run-head">
        <div>
          <h1>Schedules</h1>
          <p>Searches that run by themselves and send new listings to your webhook.</p>
        </div>
        <button className="primary" type="button" onClick={onNew}>
          New schedule
        </button>
      </header>

      {flash && <p className="banner-ok">{flash}</p>}
      {notice && <p className="banner-ok">{notice}</p>}
      {error && <p className="banner-error">{error}</p>}

      {schedules?.length > 0 && (
        <div className="bulk-bar">
          <label className="check">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => (allSelected ? setSelected(new Set()) : selectWhere(() => true))}
            />
            <span>{selected.size ? `${selected.size} selected` : "Select all"}</span>
          </label>
          <button type="button" className="link-button small" onClick={() => selectWhere((s) => s.enabled)}>
            active
          </button>
          <button type="button" className="link-button small" onClick={() => selectWhere((s) => !s.enabled)}>
            paused
          </button>
          <span className="bulk-spacer" />
          <button type="button" className="ghost small" disabled={!selected.size || bulkBusy} onClick={() => bulkAction("resume")}>
            Activate
          </button>
          <button type="button" className="ghost small" disabled={!selected.size || bulkBusy} onClick={() => bulkAction("pause")}>
            Deactivate
          </button>
          <button type="button" className="ghost small" disabled={!selected.size || bulkBusy} onClick={() => setShowBulk(true)}>
            Change settings
          </button>
          <button type="button" className="ghost small" disabled={!selected.size || bulkBusy} onClick={() => bulkAction("run")}>
            Run now
          </button>
          <button type="button" className="ghost small danger" disabled={!selected.size || bulkBusy} onClick={() => bulkAction("delete")}>
            Delete
          </button>
        </div>
      )}

      {showBulk && (
        <BulkEditor
          count={selected.size}
          onApply={bulkApply}
          onClose={() => setShowBulk(false)}
          busy={bulkBusy}
        />
      )}

      {schedules === null && !error && <p className="muted">Loading…</p>}

      {schedules?.length === 0 && (
        <div className="empty-state">
          <p>No schedules yet.</p>
          <p className="muted">
            Set up a search, choose <strong>Run on a schedule</strong> in step 5, and it will show up here.
          </p>
        </div>
      )}

      <ul className="schedule-list">
        {schedules?.map((schedule) => {
          const title = schedule.name || schedule.inputs.keywords?.join(", ");
          const isBusy = Boolean(busy[schedule.scheduleId]);
          return (
            <li key={schedule.scheduleId} className={`schedule ${schedule.enabled ? "" : "is-paused"} ${selected.has(schedule.scheduleId) ? "is-selected" : ""}`}>
              <div className="schedule-head">
                <label className="select-box" title="Select">
                  <input
                    type="checkbox"
                    checked={selected.has(schedule.scheduleId)}
                    onChange={() => toggleSelected(schedule.scheduleId)}
                    aria-label={`Select ${title}`}
                  />
                </label>
                <div className="schedule-title">
                  <h2>{title}</h2>
                  <p className="schedule-sub">
                    {schedule.inputs.keywords?.join(", ")} · {schedule.inputs.location || "Anywhere"} ·{" "}
                    {schedule.inputs.platforms?.join(", ")}
                  </p>
                </div>
                <label className={`active-toggle ${schedule.enabled ? "is-on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    disabled={isBusy}
                    onChange={() => toggle(schedule)}
                  />
                  <span>{schedule.enabled ? "Active" : "Paused"}</span>
                </label>
              </div>

              <dl className="schedule-meta">
                <div>
                  <dt>Runs</dt>
                  <dd>{schedule.description}</dd>
                </div>
                <div>
                  <dt>Next run</dt>
                  <dd>
                    {schedule.enabled && schedule.nextRunAt
                      ? `${formatDateTime(schedule.nextRunAt)} · ${formatUntil(schedule.nextRunAt)}`
                      : "Paused"}
                  </dd>
                </div>
                <div>
                  <dt>Last run</dt>
                  <dd>{schedule.lastRunAt ? formatDateTime(schedule.lastRunAt) : "Never"}</dd>
                </div>
                <div>
                  <dt>Total runs</dt>
                  <dd>{schedule.runCount}</dd>
                </div>
              </dl>

              {schedule.lastError && (
                <p className="banner-error">Last start failed: {schedule.lastError}</p>
              )}

              <div className="schedule-actions">
                <button className="primary small" type="button" disabled={isBusy} onClick={() => runNow(schedule)}>
                  Run now
                </button>
                <button className="ghost small" type="button" disabled={isBusy} onClick={() => onEdit(schedule)}>
                  Edit
                </button>
                <button className="ghost small danger" type="button" disabled={isBusy} onClick={() => remove(schedule)}>
                  Delete
                </button>
                {schedule.skipAlreadySent && schedule.runCount > 0 && (
                  <button className="link-button small" type="button" disabled={isBusy} onClick={() => forgetSent(schedule)}>
                    Forget sent listings
                  </button>
                )}
              </div>

              {schedule.runs?.length > 0 && (
                <details className="schedule-runs">
                  <summary>Past runs ({schedule.runs.length})</summary>
                  <ul>
                    {schedule.runs.map((run) => (
                      <li key={run.jobId}>
                        <button type="button" className="run-row" onClick={() => onOpenRun(run.jobId)}>
                          <span>{formatDateTime(run.createdAt)}</span>
                          <span className="muted">
                            {run.scrapedCount} scraped · {run.keptCount} kept
                          </span>
                          <span className={`pill ${RUN_PILL[run.status] ?? "is-running"}`}>{runLabel(run)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
