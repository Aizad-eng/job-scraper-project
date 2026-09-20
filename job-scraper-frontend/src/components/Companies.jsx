import { useEffect, useState, useCallback } from "react";
import ChipGroup from "./ChipGroup.jsx";
import {
  listCompanies,
  fetchCompanyStats,
  setCompanyOverride,
} from "../helpers/apiHelpers.js";
import { formatDate } from "../helpers/formatHelpers.js";
import {
  COMPANY_FILTERS,
  VERDICT_LABEL,
  SEARCH_DEBOUNCE_MS,
} from "../constants/companyConstants.js";

const pillClass = (value) =>
  value === true ? "is-failed" : value === false ? "is-done" : "";

const sourceLabel = (company) => {
  const { effective } = company;
  if (effective.source === "override") return "set by hand";
  if (!effective.source) return "";
  const when = company.verdict?.checkedAt ? ` · ${formatDate(company.verdict.checkedAt)}` : "";
  return `${effective.source}${when}`;
};

export default function Companies() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const [list, summary] = await Promise.all([
        listCompanies({ q: debouncedQ, filter, page }),
        fetchCompanyStats(),
      ]);
      setData(list);
      setStats(summary.stats);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [debouncedQ, filter, page]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  const override = async (company, value) => {
    setBusy((prev) => ({ ...prev, [company.key]: true }));
    try {
      await setCompanyOverride(company.key, value);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy((prev) => ({ ...prev, [company.key]: false }));
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Companies</h1>
        <p>
          Every company a scrape has seen, with what we know about it. Known
          agencies are skipped in future runs without spending another check.
        </p>
      </header>

      {stats && (
        <div className="totals compact">
          <div>
            <strong>{stats.total}</strong>
            <span>companies</span>
          </div>
          <div className="is-bad">
            <strong>{stats.agencies}</strong>
            <span>agencies</span>
          </div>
          <div>
            <strong>{stats.employers}</strong>
            <span>direct employers</span>
          </div>
          <div>
            <strong>{stats.unknown}</strong>
            <span>unchecked</span>
          </div>
          <div>
            <strong>{stats.overridden}</strong>
            <span>set by hand</span>
          </div>
        </div>
      )}

      <div className="field">
        <input
          className="text-input"
          type="search"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Search by name, domain or industry…"
        />
      </div>

      <ChipGroup
        options={COMPANY_FILTERS}
        selected={[filter]}
        onChange={(next) => {
          const pick = next.find((v) => v !== filter) || filter;
          setFilter(pick);
          setPage(1);
        }}
        compact
      />

      {error && <p className="banner-error">{error}</p>}
      {data === null && !error && <p className="muted">Loading…</p>}

      {data?.companies.length === 0 && (
        <div className="empty-state">
          <p>Nothing here yet.</p>
          <p className="muted">Companies appear after the first run that gets past the filters.</p>
        </div>
      )}

      <ul className="company-list">
        {data?.companies.map((company) => {
          const value = company.effective.isStaffingAgency;
          const isBusy = Boolean(busy[company.key]);
          const overridden = company.effective.source === "override";
          return (
            <li key={company.key} className="company">
              <div className="company-main">
                <div className="company-title">
                  <strong>{company.name || company.key}</strong>
                  {company.domain && (
                    <a
                      href={company.website || `https://${company.domain}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {company.domain}
                    </a>
                  )}
                </div>
                <p className="company-sub">
                  {[company.verdict?.industry || company.industry, company.size, company.headquarters]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {company.verdict?.summary && (
                  <p className="company-summary">{company.verdict.summary}</p>
                )}
                <p className="company-meta">
                  Seen {company.timesSeen}× · {company.listingsSeen} listings · last{" "}
                  {formatDate(company.lastSeenAt)}
                  {sourceLabel(company) && <> · {sourceLabel(company)}</>}
                </p>
              </div>

              <div className="company-side">
                <span className={`pill ${pillClass(value)} ${overridden ? "is-override" : ""}`}>
                  {VERDICT_LABEL[String(value)]}
                </span>
                <div className="company-actions">
                  {value !== true && (
                    <button
                      type="button"
                      className="ghost small danger"
                      disabled={isBusy}
                      onClick={() => override(company, true)}
                    >
                      Mark agency
                    </button>
                  )}
                  {value !== false && (
                    <button
                      type="button"
                      className="ghost small"
                      disabled={isBusy}
                      onClick={() => override(company, false)}
                    >
                      Mark employer
                    </button>
                  )}
                  {overridden && (
                    <button
                      type="button"
                      className="link-button small"
                      disabled={isBusy}
                      onClick={() => override(company, null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {data && data.total > data.pageSize && (
        <div className="pager">
          <button
            type="button"
            className="ghost small"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {page} of {totalPages} · {data.total} companies
          </span>
          <button
            type="button"
            className="ghost small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
