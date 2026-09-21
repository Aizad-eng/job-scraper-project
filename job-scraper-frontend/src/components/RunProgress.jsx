import { useEffect, useState } from "react";
import {
  STAGE_STATE,
  JOB_STATUS,
  POSTED_WITHIN_LABELS,
  REMOVAL_REASON_LABELS,
  AGENCY_MODE_LABELS,
  DELIVERY_MODE_LABELS,
} from "../constants/statusConstants.js";
import { COMPANY_SIZE_BANDS } from "../constants/searchConstants.js";
import {
  getStageState,
  formatElapsed,
  formatUntil,
  formatDuration,
  formatAgoShort,
  visibleStages,
} from "../helpers/formatHelpers.js";

const STAGE_TIME_KEY = {
  scraping: "scraping",
  filtering: "filtering",
  classifying: "classifying",
  delivering: "delivering",
};

const sizeLabel = (values = []) => {
  if (!values.length) return "Any size";
  return values
    .map((value) => COMPANY_SIZE_BANDS.find((b) => b.value === value)?.label || value)
    .join(", ");
};

const shortUrl = (url = "") => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 28 ? `${parsed.pathname.slice(0, 28)}…` : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
};

export default function RunProgress({ jobId, status, onReset, onRerun, onReprocess, reprocessBusy, onOpenSchedules }) {
  // ticks once a second while the run is live; elapsed is derived from it
  const [now, setNow] = useState(() => Date.now());

  const isDone = status?.status === JOB_STATUS.DONE;
  const isFailed = status?.status === JOB_STATUS.FAILED;
  const isEmpty = status?.status === JOB_STATUS.EMPTY;
  const isFinished = isDone || isFailed || isEmpty;

  useEffect(() => {
    if (isFinished) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isFinished]);

  const elapsed = formatElapsed(
    status?.createdAt,
    isFinished ? status?.updatedAt : new Date(now).toISOString(),
  );

  if (!status) {
    return (
      <div className="panel">
        <p className="muted">Loading run {jobId.slice(0, 8)}…</p>
      </div>
    );
  }

  const stages = visibleStages(status.inputs);
  const delivery = status.delivery || {};
  const counts = {
    ...status,
    sentCount: delivery.total ? `${delivery.sent ?? 0} / ${delivery.total}` : null,
  };
  const removedEntries = Object.entries(status.removedByReason || {}).sort(
    (a, b) => b[1] - a[1],
  );

  const title = isFailed
    ? "Search failed"
    : isEmpty
      ? "Nothing to send"
      : isDone
        ? delivery.failed
          ? "Sent, with some failures"
          : "Sent to your webhook"
        : "Working on it";

  return (
    <div className="panel">
      <header className="panel-head run-head">
        <div>
          <h1>{title}</h1>
          <p>
            {isFailed
              ? status.error
              : `Run ${jobId.slice(0, 8)} · ${isFinished ? `finished in ${elapsed}` : elapsed}`}
            {status.scheduleId && (
              <>
                {" · "}
                <button type="button" className="link-button inline" onClick={onOpenSchedules}>
                  started by a schedule
                </button>
              </>
            )}
            {status.reprocessedFrom && <> · reprocessed from run {status.reprocessedFrom.slice(0, 8)}</>}
          </p>
        </div>
        <button className="ghost" type="button" onClick={onReset}>
          New search
        </button>
      </header>

      {!isFailed && (
        <ol className="stages">
          {stages.map((stage) => {
            const state = getStageState(stage.status, status.status, stages);
            const count = stage.countKey ? counts[stage.countKey] : null;
            const showCount =
              state !== STAGE_STATE.WAITING &&
              count !== null &&
              count !== undefined;

            const times = status.stageTimes?.[STAGE_TIME_KEY[stage.status]];
            const showProgress =
              state === STAGE_STATE.ACTIVE &&
              status.progress &&
              (stage.status !== JOB_STATUS.SCRAPING || status.reprocessedFrom);
            const pct =
              showProgress && status.progress.total > 0
                ? Math.min(100, Math.round((status.progress.done / status.progress.total) * 100))
                : null;
            const stalled =
              showProgress && status.progress.updatedAt && now - new Date(status.progress.updatedAt).getTime() > 10 * 60 * 1000;

            return (
              <li key={stage.status} className={`stage is-${state}`}>
                <span className="stage-dot" aria-hidden="true" />
                <span className="stage-label">
                  {stage.label}
                  {times?.startedAt && (state === STAGE_STATE.DONE || state === STAGE_STATE.ACTIVE) && (
                    <span className="stage-time">
                      {state === STAGE_STATE.DONE && times.endedAt
                        ? `took ${formatDuration(times.startedAt, times.endedAt)}`
                        : `running ${formatDuration(times.startedAt, new Date(now).toISOString())}`}
                    </span>
                  )}
                  {showProgress && (
                    <span className="stage-progress">
                      <em className="stage-sub">
                        {status.progress.label}
                        {status.progress.total > 0 && (
                          <> · {status.progress.done.toLocaleString()} of {status.progress.total.toLocaleString()}{pct !== null && ` (${pct}%)`}</>
                        )}
                        {status.progress.updatedAt && (
                          <span className={stalled ? "is-stalled" : ""}>
                            {" · "}updated {formatAgoShort(status.progress.updatedAt, now)}
                            {stalled && " — no update for a while, check the server logs"}
                          </span>
                        )}
                      </em>
                      {pct !== null && (
                        <span className="bar" aria-hidden="true">
                          <span className="bar-fill" style={{ width: `${pct}%` }} />
                        </span>
                      )}
                    </span>
                  )}
                  {stage.status === JOB_STATUS.CLASSIFYING &&
                    state === STAGE_STATE.ACTIVE &&
                    status.agencyCheck && (
                      <em className="stage-sub">
                        {status.agencyCheck.known} known from memory
                        {status.agencyCheck.toCheck > 0 && (
                          <> · checking {status.agencyCheck.checked} of {status.agencyCheck.toCheck} with ScrapingDog</>
                        )}
                      </em>
                    )}
                  {stage.status === JOB_STATUS.SCRAPING &&
                    state === STAGE_STATE.ACTIVE &&
                    (status.totalRuns > 1 || status.pendingRuns > 0) && (
                      <em className="stage-sub">
                        {status.completedRuns} of {status.totalRuns + (status.pendingRuns || 0)} scrapes finished
                        {status.runningRuns > 0 && <> · {status.runningRuns} running</>}
                        {status.pendingRuns > 0 && (
                          <>
                            {" · "}{status.pendingRuns} queued
                            {status.nextLaunchAt && new Date(status.nextLaunchAt).getTime() > now
                              ? <>, next starts {formatUntil(status.nextLaunchAt)}</>
                              : <>, waiting for a free slot</>}
                          </>
                        )}
                      </em>
                    )}
                </span>
                {showCount && (
                  <span className="stage-count">
                    {count} <em>{stage.countLabel}</em>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {isEmpty && <p className="banner-error">{status.emptyReason}</p>}

      {(isDone || isEmpty) && (
        <div className="totals">
          <div>
            <strong>{status.scrapedCount}</strong>
            <span>listings scraped</span>
          </div>
          <div>
            <strong>{status.keptCount}</strong>
            <span>kept</span>
          </div>
          <div>
            <strong>{status.companiesCount}</strong>
            <span>companies</span>
          </div>
          {isDone && (
            <div>
              <strong>{delivery.sent ?? 0}</strong>
              <span>rows sent</span>
            </div>
          )}
          {isDone && delivery.failed > 0 && (
            <div className="is-bad">
              <strong>{delivery.failed}</strong>
              <span>failed</span>
            </div>
          )}
        </div>
      )}

      {isDone && delivery.failed > 0 && delivery.lastError && (
        <p className="banner-error">
          Some rows were rejected by the webhook. Last error: {delivery.lastError}
        </p>
      )}

      {status.domainStats && (status.domainStats.found > 0 || status.domainStats.cleaned > 0 || status.domainStats.fromMemory > 0) && (
        <p className="muted domain-note">
          Domains: {status.domainStats.fromBoard} from the boards
          {status.domainStats.cleaned > 0 && <>, {status.domainStats.cleaned} unusable dropped</>}
          {status.domainStats.fromMemory > 0 && <>, {status.domainStats.fromMemory} from memory</>}
          {status.domainStats.found > 0 && <>, {status.domainStats.found} found via Google</>}
          {status.domainStats.notFound > 0 && <>, {status.domainStats.notFound} not found</>}
        </p>
      )}

      {status.salaryStats && (
        <p className="muted domain-note">
          Salaries: {status.salaryStats.board + status.salaryStats.parsed} from the boards
          {status.salaryStats.claudeText + status.salaryStats.claudeDescription > 0 && (
            <>, {status.salaryStats.claudeText + status.salaryStats.claudeDescription} found by Claude</>
          )}
          {status.salaryStats.none > 0 && <>, {status.salaryStats.none} not stated</>}
          {status.salaryStats.failed > 0 && <>, {status.salaryStats.failed} failed</>}
        </p>
      )}

      {removedEntries.length > 0 && (
        <details className="removed" open={isEmpty}>
          <summary>
            Why {status.removedCount} {status.removedCount === 1 ? "listing was" : "listings were"} removed
          </summary>
          <ul>
            {removedEntries.map(([reason, count]) => (
              <li key={reason}>
                <span>{REMOVAL_REASON_LABELS[reason] || reason}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}

      {status.inputs && (
        <details className="run-params-wrap">
          <summary>Search settings</summary>
          <dl className="run-params">
            <div className="wide">
              <dt>Job titles</dt>
              <dd>{status.inputs.keywords?.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{status.inputs.location || "Anywhere"}</dd>
            </div>
            <div>
              <dt>Job boards</dt>
              <dd>{status.inputs.platforms?.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>Listings per title</dt>
              <dd>{status.inputs.jobsPerKeyword}</dd>
            </div>
            <div>
              <dt>Posted within</dt>
              <dd>{POSTED_WITHIN_LABELS[status.inputs.postedWithin] || "Any time"}</dd>
            </div>
            <div className="wide">
              <dt>Company size</dt>
              <dd>
                {sizeLabel(status.inputs.companySizes)}
                {status.inputs.companySizes?.length > 0 && status.inputs.includeUnknownSize && (
                  <em> + unknown</em>
                )}
              </dd>
            </div>
            <div>
              <dt>Staffing agencies</dt>
              <dd>{AGENCY_MODE_LABELS[status.inputs.agencyMode] || "—"}</dd>
            </div>
            {status.inputs.maxJobsPerCompany > 0 && (
              <div>
                <dt>Per company</dt>
                <dd>max {status.inputs.maxJobsPerCompany}</dd>
              </div>
            )}
            {status.inputs.filterKeywords?.length > 0 && (
              <div className="wide">
                <dt>Must mention</dt>
                <dd>
                  {status.inputs.filterKeywords.length > 12
                    ? `${status.inputs.filterKeywords.slice(0, 12).join(", ")} … (${status.inputs.filterKeywords.length} words)`
                    : status.inputs.filterKeywords.join(", ")}
                  <em> in {status.inputs.filterMatchIn?.join(" or ")}{status.inputs.wholeWordMatch === false ? ", substring" : ", whole words"}</em>
                </dd>
              </div>
            )}
            {status.inputs.excludeWords?.length > 0 && (
              <div className="wide">
                <dt>Excluded words</dt>
                <dd>
                  {status.inputs.excludeWords.length > 12
                    ? `${status.inputs.excludeWords.slice(0, 12).join(", ")} … (${status.inputs.excludeWords.length} words)`
                    : status.inputs.excludeWords.join(", ")}
                  <em> in {status.inputs.excludeMatchIn?.join(" or ")}</em>
                </dd>
              </div>
            )}
            {status.inputs.includeIndustries?.length > 0 && (
              <div className="wide">
                <dt>Only industries</dt>
                <dd>{status.inputs.includeIndustries.join(", ")}</dd>
              </div>
            )}
            {status.inputs.excludeIndustries?.length > 0 && (
              <div className="wide">
                <dt>Excluded industries</dt>
                <dd>{status.inputs.excludeIndustries.join(", ")}</dd>
              </div>
            )}
            {status.inputs.excludeCompanies?.length > 0 && (
              <div className="wide">
                <dt>Excluded companies</dt>
                <dd>{status.inputs.excludeCompanies.join(", ")}</dd>
              </div>
            )}
            {status.inputs.seniorityLevels?.length > 0 && (
              <div className="wide">
                <dt>Seniority</dt>
                <dd>{status.inputs.seniorityLevels.join(", ")}</dd>
              </div>
            )}
            {status.inputs.employmentTypes?.length > 0 && (
              <div className="wide">
                <dt>Employment type</dt>
                <dd>{status.inputs.employmentTypes.join(", ")}</dd>
              </div>
            )}
            {(status.inputs.salaryMin != null || status.inputs.salaryMax != null) && (
              <div>
                <dt>Salary per year</dt>
                <dd>
                  {status.inputs.salaryMin != null ? status.inputs.salaryMin.toLocaleString() : "any"}
                  {" – "}
                  {status.inputs.salaryMax != null ? status.inputs.salaryMax.toLocaleString() : "any"}
                  <em>{status.inputs.includeNoSalary === false ? " · unknown dropped" : " · unknown kept"}</em>
                </dd>
              </div>
            )}
            {status.inputs.dropBankVps && (
              <div>
                <dt>Bank VPs</dt>
                <dd>Dropped</dd>
              </div>
            )}
            {status.inputs.maxConcurrentRuns > 0 && (
              <div>
                <dt>Actor runs at once</dt>
                <dd>{status.inputs.maxConcurrentRuns}</dd>
              </div>
            )}
            {status.inputs.launchSpacingMinutes > 0 && (
              <div>
                <dt>Keyword spacing</dt>
                <dd>{status.inputs.launchSpacingMinutes} min apart</dd>
              </div>
            )}
            <div>
              <dt>Missing domains</dt>
              <dd>{status.inputs.findMissingDomains === false ? "Not looked up" : "Looked up via Google"}</dd>
            </div>
            <div>
              <dt>Company cooldown</dt>
              <dd>{status.inputs.cooldownDays > 0 ? `${status.inputs.cooldownDays} days` : "Off"}</dd>
            </div>
            <div className="wide">
              <dt>Webhook</dt>
              <dd>
                {shortUrl(status.inputs.webhookUrl)}
                <em> · {DELIVERY_MODE_LABELS[status.inputs.deliveryMode] || ""}</em>
              </dd>
            </div>
          </dl>
        </details>
      )}

      {isFinished && (
        <div className="button-row">
          <button className="primary" type="button" onClick={onRerun}>
            Run again with these settings
          </button>
          {status.importableRuns > 0 && (
            <button
              className="ghost"
              type="button"
              disabled={reprocessBusy}
              onClick={onReprocess}
              title="Pulls the datasets these scrapes already produced from Apify and runs the filters, checks and delivery again. No new scraping."
            >
              {reprocessBusy ? "Starting…" : `Reprocess from Apify (${status.importableRuns} datasets, no re-scrape)`}
            </button>
          )}
          <button className="ghost" type="button" onClick={onReset}>
            New search
          </button>
        </div>
      )}
    </div>
  );
}
