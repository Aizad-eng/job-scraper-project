import { useState, useEffect, useCallback } from "react";
import SearchForm from "./components/SearchForm.jsx";
import RunProgress from "./components/RunProgress.jsx";
import RecentRuns from "./components/RecentRuns.jsx";
import Schedules from "./components/Schedules.jsx";
import {
  startScrape,
  fetchJobStatus,
  createSchedule,
  updateSchedule,
} from "./helpers/apiHelpers.js";
import { isRunning } from "./helpers/formatHelpers.js";
import {
  getRecentRuns,
  rememberRun,
  updateRecentRun,
  forgetRun,
} from "./helpers/storageHelpers.js";
import { POLL_INTERVAL_MS, FINISHED_STATUSES } from "./constants/statusConstants.js";

const readRoute = () => {
  const params = new URLSearchParams(window.location.search);
  return { jobId: params.get("job"), view: params.get("view") || "search" };
};

const writeRoute = ({ jobId, view }) => {
  const params = new URLSearchParams();
  if (jobId) params.set("job", jobId);
  else if (view && view !== "search") params.set("view", view);
  const query = params.toString();
  window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
};

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [prefill, setPrefill] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [flash, setFlash] = useState("");
  const [recentRuns, setRecentRuns] = useState(getRecentRuns);

  const { jobId, view } = route;

  const go = useCallback((next, { replace = false } = {}) => {
    setStatus(null);
    setSubmitError("");
    setRoute(next);
    if (!replace) writeRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  const openJob = useCallback((id) => go({ jobId: id, view: "search" }), [go]);
  const openSearch = useCallback(() => go({ jobId: null, view: "search" }), [go]);
  const openSchedules = useCallback(() => go({ jobId: null, view: "schedules" }), [go]);

  // browser back / forward
  useEffect(() => {
    const onPop = () => go(readRoute(), { replace: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [go]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const next = await fetchJobStatus(jobId);
        if (cancelled) return;
        setStatus(next);

        if (FINISHED_STATUSES.includes(next.status)) {
          updateRecentRun(jobId, {
            status: next.status,
            sent: next.delivery?.sent ?? null,
          });
          setRecentRuns(getRecentRuns());
        }

        if (isRunning(next.status)) timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (error) {
        if (!cancelled) setSubmitError(error.message);
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const handleSubmit = async (values) => {
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const result = await startScrape(values);
      rememberRun({
        jobId: result.jobId,
        keywords: values.keywords,
        location: values.location,
        platforms: values.platforms,
        createdAt: new Date().toISOString(),
        status: null,
      });
      setRecentRuns(getRecentRuns());
      setPrefill(null);
      openJob(result.jobId);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSchedule = async (inputs, scheduleFields, scheduleId) => {
    setIsSubmitting(true);
    setSubmitError("");

    try {
      if (scheduleId) {
        await updateSchedule(scheduleId, { inputs, ...scheduleFields });
        setFlash("Schedule updated.");
      } else {
        await createSchedule({ inputs, ...scheduleFields });
        setFlash("Schedule saved. It will run at the next scheduled time.");
      }
      setEditingSchedule(null);
      setPrefill(null);
      openSchedules();
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setPrefill(null);
    setFlash("");
    openSearch();
  };

  const handleNewFromSchedules = () => {
    setEditingSchedule(null);
    setPrefill(null);
    setFlash("");
    openSearch();
  };

  const handleCancelEdit = () => {
    setEditingSchedule(null);
    openSchedules();
  };

  const handleReset = () => {
    setPrefill(null);
    setEditingSchedule(null);
    openSearch();
  };

  const handleRerun = () => {
    if (status?.inputs) setPrefill(status.inputs);
    setEditingSchedule(null);
    openSearch();
  };

  const handleForget = (id) => {
    forgetRun(id);
    setRecentRuns(getRecentRuns());
  };

  const showNav = !jobId;

  return (
    <main className="shell">
      {showNav && (
        <nav className="topnav" aria-label="Sections">
          <button
            type="button"
            className={view === "search" ? "is-on" : ""}
            onClick={handleNewFromSchedules}
          >
            New search
          </button>
          <button
            type="button"
            className={view === "schedules" ? "is-on" : ""}
            onClick={() => {
              setFlash("");
              openSchedules();
            }}
          >
            Schedules
          </button>
        </nav>
      )}

      {jobId ? (
        <>
          {submitError && !status && <p className="banner-error">{submitError}</p>}
          <RunProgress
            jobId={jobId}
            status={status}
            onReset={handleReset}
            onRerun={handleRerun}
            onOpenSchedules={openSchedules}
          />
        </>
      ) : view === "schedules" ? (
        <Schedules
          onOpenRun={openJob}
          onEdit={handleEditSchedule}
          onNew={handleNewFromSchedules}
          flash={flash}
        />
      ) : (
        <>
          <SearchForm
            key={editingSchedule ? `edit-${editingSchedule.scheduleId}` : prefill ? "prefilled" : "blank"}
            onSubmit={handleSubmit}
            onSaveSchedule={handleSaveSchedule}
            onCancelEdit={handleCancelEdit}
            isSubmitting={isSubmitting}
            submitError={submitError}
            initialValues={prefill}
            editingSchedule={editingSchedule}
          />
          {!editingSchedule && (
            <RecentRuns runs={recentRuns} onOpen={openJob} onForget={handleForget} />
          )}
        </>
      )}
    </main>
  );
}
