import { useState } from "react";
import {
  POSTED_WITHIN_OPTIONS,
  AGENCY_MODE_OPTIONS,
  DELIVERY_MODE_OPTIONS,
} from "../constants/searchConstants.js";

const UNCHANGED = "";

/**
 * Change a few settings on many schedules at once. Every field starts as
 * "leave unchanged"; only fields the user sets are sent.
 */
export default function BulkEditor({ count, onApply, onClose, busy }) {
  const [form, setForm] = useState({
    jobsPerKeyword: UNCHANGED,
    postedWithin: UNCHANGED,
    agencyMode: UNCHANGED,
    deliveryMode: UNCHANGED,
    cooldownDays: UNCHANGED,
    launchSpacingMinutes: UNCHANGED,
    salaryMin: UNCHANGED,
    salaryMax: UNCHANGED,
    webhookUrl: UNCHANGED,
    runTime: UNCHANGED,
    skipAlreadySent: UNCHANGED,
  });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const changed = Object.entries(form).filter(([, v]) => v !== UNCHANGED);

  const apply = () => {
    const inputs = {};
    const schedule = {};
    changed.forEach(([key, value]) => {
      if (key === "runTime") schedule.runTime = value;
      else if (key === "skipAlreadySent") schedule.skipAlreadySent = value === "yes";
      else if (["jobsPerKeyword", "cooldownDays", "launchSpacingMinutes", "salaryMin", "salaryMax"].includes(key)) {
        inputs[key] = Number(value);
      } else inputs[key] = value;
    });
    onApply({ inputs, schedule });
  };

  const select = (key, options, label) => (
    <div className="field">
      <label className="field-label" htmlFor={`bulk-${key}`}>{label}</label>
      <select
        id={`bulk-${key}`}
        className={`text-input ${form[key] !== UNCHANGED ? "is-changed" : ""}`}
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
      >
        <option value={UNCHANGED}>Leave unchanged</option>
        {options.map((option) => {
          const value = typeof option === "object" ? option.value : option;
          const text = typeof option === "object" ? option.label : option;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
    </div>
  );

  const number = (key, label, placeholder) => (
    <div className="field">
      <label className="field-label" htmlFor={`bulk-${key}`}>{label}</label>
      <input
        id={`bulk-${key}`}
        type="number"
        min="0"
        className={`text-input ${form[key] !== UNCHANGED ? "is-changed" : ""}`}
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        placeholder={placeholder || "Leave unchanged"}
      />
    </div>
  );

  return (
    <div className="bulk-editor">
      <div className="bulk-head">
        <strong>Change settings on {count} {count === 1 ? "schedule" : "schedules"}</strong>
        <button type="button" className="link-button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="field-hint">
        Only the fields you set are changed. Everything else on each schedule stays as it is.
      </p>

      <div className="bulk-grid">
        {number("jobsPerKeyword", "Listings per title", "Leave unchanged (1–5000)")}
        {select("postedWithin", POSTED_WITHIN_OPTIONS, "Posted within")}
        {select("agencyMode", AGENCY_MODE_OPTIONS, "Staffing agencies")}
        {select("deliveryMode", DELIVERY_MODE_OPTIONS, "Send")}
        {number("cooldownDays", "Company cooldown (days)")}
        {number("launchSpacingMinutes", "Minutes between keyword searches")}
        {number("salaryMin", "Min salary per year")}
        {number("salaryMax", "Max salary per year")}
        <div className="field">
          <label className="field-label" htmlFor="bulk-runTime">Run at (time of day)</label>
          <input
            id="bulk-runTime"
            type="time"
            className={`text-input ${form.runTime !== UNCHANGED ? "is-changed" : ""}`}
            value={form.runTime}
            onChange={(event) => set("runTime", event.target.value)}
          />
        </div>
        {select("skipAlreadySent", [{ value: "yes", label: "Skip already sent" }, { value: "no", label: "Send everything" }], "Already-sent listings")}
        <div className="field wide">
          <label className="field-label" htmlFor="bulk-webhookUrl">Webhook URL</label>
          <input
            id="bulk-webhookUrl"
            type="url"
            className={`text-input ${form.webhookUrl !== UNCHANGED ? "is-changed" : ""}`}
            value={form.webhookUrl}
            onChange={(event) => set("webhookUrl", event.target.value)}
            placeholder="Leave unchanged"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="button-row">
        <button type="button" className="primary" disabled={busy || !changed.length} onClick={apply}>
          {busy ? "Applying…" : `Apply ${changed.length} ${changed.length === 1 ? "change" : "changes"}`}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
