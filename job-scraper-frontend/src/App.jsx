import { useState, useEffect, useCallback } from "react";
import SearchForm from "./components/SearchForm.jsx";
import RunProgress from "./components/RunProgress.jsx";
import RecentRuns from "./components/RecentRuns.jsx";
import { startScrape, fetchJobStatus } from "./helpers/apiHelpers.js";
import { isRunning } from "./helpers/formatHelpers.js";
import {
  getRecentRuns,
  rememberRun,
  updateRecentRun,
  forgetRun,
} from "./helpers/storageHelpers.js";
import { POLL_INTERVAL_MS, FINISHED_STATUSES } from "./constants/statusConstants.js";

const readJobFromUrl = () => new URLSearchParams(window.location.search).get("job");

export default function App() {
  const [jobId, setJobId] = useState(readJobFromUrl);
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [prefill, setPrefill] = useState(null);
  const [recentRuns, setRecentRuns] = useState(getRecentRuns);

  const openJob = useCallback((id) => {
    setStatus(null);
    setSubmitError("");
    setJobId(id);
    window.history.replaceState(null, "", id ? `?job=${id}` : window.location.pathname);
  }, []);

  // browser back / forward
  useEffect(() => {
    const onPop = () => openJob(readJobFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openJob]);

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
      window.scrollTo({ top: 0 });
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setPrefill(null);
    openJob(null);
  };

  const handleRerun = () => {
    if (status?.inputs) setPrefill(status.inputs);
    openJob(null);
  };

  const handleForget = (id) => {
    forgetRun(id);
    setRecentRuns(getRecentRuns());
  };

  return (
    <main className="shell">
      {jobId ? (
        <>
          {submitError && !status && <p className="banner-error">{submitError}</p>}
          <RunProgress
            jobId={jobId}
            status={status}
            onReset={handleReset}
            onRerun={handleRerun}
          />
        </>
      ) : (
        <>
          <SearchForm
            key={prefill ? "prefilled" : "blank"}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            submitError={submitError}
            initialValues={prefill}
          />
          <RecentRuns runs={recentRuns} onOpen={openJob} onForget={handleForget} />
        </>
      )}
    </main>
  );
}
