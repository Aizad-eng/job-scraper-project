import { useState } from "react";
import TagInput from "./TagInput.jsx";
import ChipGroup from "./ChipGroup.jsx";
import {
  PLATFORMS,
  DEFAULT_FORM_VALUES,
  JOBS_PER_KEYWORD_OPTIONS,
  FIELD_HINTS,
  POSTED_WITHIN_OPTIONS,
  MATCH_IN_OPTIONS,
  COMPANY_SIZE_BANDS,
  AGENCY_MODE_OPTIONS,
  DELIVERY_MODE_OPTIONS,
  SENIORITY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
} from "../constants/searchConstants.js";
import {
  validateForm,
  describeRun,
  isValidWebhookUrl,
} from "../helpers/formatHelpers.js";
import { sendTestRow } from "../helpers/apiHelpers.js";
import {
  getRememberedWebhook,
  rememberWebhook,
} from "../helpers/storageHelpers.js";

const restoreValues = (initialValues) => {
  const base = { ...DEFAULT_FORM_VALUES, webhookUrl: getRememberedWebhook() };
  if (!initialValues) return base;

  // only take keys the form actually knows about
  return Object.keys(DEFAULT_FORM_VALUES).reduce((acc, key) => {
    acc[key] = initialValues[key] ?? base[key];
    return acc;
  }, {});
};

export default function SearchForm({
  onSubmit,
  isSubmitting,
  submitError,
  initialValues,
}) {
  const [values, setValues] = useState(() => restoreValues(initialValues));
  const [errors, setErrors] = useState({});
  const [showMore, setShowMore] = useState(false);
  const [test, setTest] = useState({ state: "idle", message: "" });

  const setField = (key, value) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    const found = validateForm(values);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = document.querySelector(".field-error");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    rememberWebhook(values.webhookUrl.trim());
    onSubmit({ ...values, webhookUrl: values.webhookUrl.trim() });
  };

  const handleTest = async () => {
    if (!isValidWebhookUrl(values.webhookUrl)) {
      setErrors((prev) => ({
        ...prev,
        webhookUrl: "Enter a valid URL starting with https://",
      }));
      return;
    }
    setErrors((prev) => ({ ...prev, webhookUrl: undefined }));
    setTest({ state: "sending", message: "" });
    try {
      const result = await sendTestRow(
        values.webhookUrl.trim(),
        values.deliveryMode,
      );
      if (result.success) {
        rememberWebhook(values.webhookUrl.trim());
        setTest({
          state: "ok",
          message: `Sent. Your webhook answered HTTP ${result.statusCode}. Check the receiver for a row marked isTest: true.`,
        });
      } else {
        setTest({ state: "error", message: result.error });
      }
    } catch (error) {
      setTest({ state: "error", message: error.message });
    }
  };

  const moreFiltersCount = [
    values.includeIndustries.length,
    values.excludeIndustries.length,
    values.excludeCompanies.length,
    values.seniorityLevels.length,
    values.employmentTypes.length,
    values.maxJobsPerCompany > 0 ? 1 : 0,
  ].filter(Boolean).length;

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Find companies that are hiring</h1>
        <p>
          Scrape job listings, drop the staffing agencies, and send what's left
          straight to your webhook.
        </p>
      </header>

      {/* ------------------------------------------------------------ */}
      <section className="section">
        <h2 className="section-title">
          <span className="step">1</span> What to search
        </h2>

        <TagInput
          label="Job titles"
          hint={FIELD_HINTS.keywords}
          values={values.keywords}
          onChange={(next) => setField("keywords", next)}
          placeholder="software engineer, account executive…"
          error={errors.keywords}
        />

        <div className="field-row two">
          <div className="field">
            <label className="field-label" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              className="text-input"
              value={values.location}
              onChange={(event) => setField("location", event.target.value)}
              placeholder="United States"
            />
            <p className="field-hint below">{FIELD_HINTS.location}</p>
          </div>

          <ChipGroup
            label="Job boards"
            options={PLATFORMS}
            selected={values.platforms}
            onChange={(next) => setField("platforms", next)}
            error={errors.platforms}
          />
        </div>

        <div className="field-row two">
          <div className="field">
            <label className="field-label" htmlFor="jobsPerKeyword">
              Listings per title
            </label>
            <select
              id="jobsPerKeyword"
              className="text-input"
              value={values.jobsPerKeyword}
              onChange={(event) =>
                setField("jobsPerKeyword", Number(event.target.value))
              }
            >
              {JOBS_PER_KEYWORD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="postedWithin">
              Posted within
            </label>
            <select
              id="postedWithin"
              className="text-input"
              value={values.postedWithin}
              onChange={(event) => setField("postedWithin", event.target.value)}
            >
              {POSTED_WITHIN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      <section className="section">
        <h2 className="section-title">
          <span className="step">2</span> Company size
        </h2>

        <ChipGroup
          hint={FIELD_HINTS.companySizes}
          options={COMPANY_SIZE_BANDS}
          selected={values.companySizes}
          onChange={(next) => setField("companySizes", next)}
          allLabel="Any size"
          compact
        />

        {values.companySizes.length > 0 && (
          <label className="check">
            <input
              type="checkbox"
              checked={values.includeUnknownSize}
              onChange={(event) =>
                setField("includeUnknownSize", event.target.checked)
              }
            />
            <span>Also keep companies with unknown size</span>
            <em>{FIELD_HINTS.includeUnknownSize}</em>
          </label>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      <section className="section">
        <h2 className="section-title">
          <span className="step">3</span> Filters
        </h2>

        <div className="field">
          <span className="field-label">Staffing agencies</span>
          <div className="option-list">
            {AGENCY_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`option ${values.agencyMode === option.value ? "is-on" : ""}`}
              >
                <input
                  type="radio"
                  name="agencyMode"
                  value={option.value}
                  checked={values.agencyMode === option.value}
                  onChange={() => setField("agencyMode", option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <em>{option.hint}</em>
                </span>
              </label>
            ))}
          </div>
        </div>

        <TagInput
          label="Must mention"
          hint={FIELD_HINTS.filterKeywords}
          values={values.filterKeywords}
          onChange={(next) => setField("filterKeywords", next)}
          placeholder="react, hubspot, remote…"
        />
        {values.filterKeywords.length > 0 && (
          <ChipGroup
            label="Look for these in"
            options={MATCH_IN_OPTIONS}
            selected={values.filterMatchIn}
            onChange={(next) => setField("filterMatchIn", next)}
            error={errors.filterMatchIn}
            compact
          />
        )}

        <TagInput
          label="Exclude listings mentioning"
          hint={FIELD_HINTS.excludeWords}
          values={values.excludeWords}
          onChange={(next) => setField("excludeWords", next)}
          placeholder="intern, senior, clearance…"
        />
        {values.excludeWords.length > 0 && (
          <ChipGroup
            label="Look for these in"
            options={MATCH_IN_OPTIONS}
            selected={values.excludeMatchIn}
            onChange={(next) => setField("excludeMatchIn", next)}
            error={errors.excludeMatchIn}
            compact
          />
        )}

        <button
          type="button"
          className="link-button"
          onClick={() => setShowMore((prev) => !prev)}
          aria-expanded={showMore}
        >
          {showMore ? "Hide more filters" : "More filters"}
          {moreFiltersCount > 0 && (
            <span className="badge">{moreFiltersCount} active</span>
          )}
        </button>

        {showMore && (
          <div className="more-filters">
            <TagInput
              label="Only these industries"
              hint={FIELD_HINTS.includeIndustries}
              values={values.includeIndustries}
              onChange={(next) => setField("includeIndustries", next)}
              placeholder="software, financial services…"
            />
            <TagInput
              label="Exclude industries"
              hint={FIELD_HINTS.excludeIndustries}
              values={values.excludeIndustries}
              onChange={(next) => setField("excludeIndustries", next)}
              placeholder="government, education…"
            />
            <TagInput
              label="Exclude companies"
              hint={FIELD_HINTS.excludeCompanies}
              values={values.excludeCompanies}
              onChange={(next) => setField("excludeCompanies", next)}
              placeholder="amazon.com, deloitte…"
            />
            <ChipGroup
              label="Seniority level"
              hint={FIELD_HINTS.seniorityLevels}
              options={SENIORITY_OPTIONS}
              selected={values.seniorityLevels}
              onChange={(next) => setField("seniorityLevels", next)}
              allLabel="Any"
              compact
            />
            <ChipGroup
              label="Employment type"
              hint={FIELD_HINTS.employmentTypes}
              options={EMPLOYMENT_TYPE_OPTIONS}
              selected={values.employmentTypes}
              onChange={(next) => setField("employmentTypes", next)}
              allLabel="Any"
              compact
            />
            <div className="field narrow">
              <label className="field-label" htmlFor="maxJobsPerCompany">
                Max listings per company
              </label>
              <input
                id="maxJobsPerCompany"
                type="number"
                min="0"
                max="50"
                className="text-input"
                value={values.maxJobsPerCompany}
                onChange={(event) =>
                  setField(
                    "maxJobsPerCompany",
                    Math.max(0, Number(event.target.value) || 0),
                  )
                }
              />
              <p className="field-hint below">{FIELD_HINTS.maxJobsPerCompany}</p>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      <section className="section">
        <h2 className="section-title">
          <span className="step">4</span> Where to send results
        </h2>

        <div className="field">
          <label className="field-label" htmlFor="webhookUrl">
            Webhook URL
          </label>
          <p className="field-hint">{FIELD_HINTS.webhookUrl}</p>
          <div className="input-with-button">
            <input
              id="webhookUrl"
              className="text-input"
              type="url"
              value={values.webhookUrl}
              onChange={(event) => {
                setField("webhookUrl", event.target.value);
                if (test.state !== "idle") setTest({ state: "idle", message: "" });
              }}
              placeholder="https://api.clay.com/v3/sources/webhook/…"
              spellCheck={false}
            />
            <button
              type="button"
              className="ghost"
              onClick={handleTest}
              disabled={test.state === "sending"}
            >
              {test.state === "sending" ? "Sending…" : "Send test row"}
            </button>
          </div>
          {errors.webhookUrl && <p className="field-error">{errors.webhookUrl}</p>}
          {test.message && (
            <p className={`test-result is-${test.state}`}>{test.message}</p>
          )}
        </div>

        <div className="field">
          <span className="field-label">Send</span>
          <div className="option-list">
            {DELIVERY_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`option ${values.deliveryMode === option.value ? "is-on" : ""}`}
              >
                <input
                  type="radio"
                  name="deliveryMode"
                  value={option.value}
                  checked={values.deliveryMode === option.value}
                  onChange={() => setField("deliveryMode", option.value)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <em>{option.hint}</em>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {submitError && <p className="banner-error">{submitError}</p>}

      <div className="submit-row">
        <button
          className="primary"
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Starting…" : "Start search"}
        </button>
        <span className="submit-note">{describeRun(values)}</span>
      </div>
    </div>
  );
}
