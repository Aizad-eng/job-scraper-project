import ChipGroup from "./ChipGroup.jsx";
import {
  FREQUENCY_OPTIONS,
  WEEKDAY_OPTIONS,
} from "../constants/scheduleConstants.js";

export default function ScheduleFields({ fields, onChange, errors = {} }) {
  const set = (key, value) => onChange({ ...fields, [key]: value });

  return (
    <div className="more-filters schedule-fields">
      <div className="field">
        <label className="field-label" htmlFor="scheduleName">
          Name <em className="optional">optional</em>
        </label>
        <input
          id="scheduleName"
          className="text-input"
          value={fields.name}
          onChange={(event) => set("name", event.target.value)}
          placeholder="Austin engineering roles"
        />
      </div>

      <ChipGroup
        label="How often"
        options={FREQUENCY_OPTIONS}
        selected={[fields.frequency]}
        onChange={(next) => {
          const pick = next.find((v) => v !== fields.frequency) || fields.frequency;
          // switching to weekdays with nothing chosen starts from Mon–Fri
          const weekdays =
            pick === "weekdays" && !fields.weekdays.length ? [1, 2, 3, 4, 5] : fields.weekdays;
          onChange({ ...fields, frequency: pick, weekdays });
        }}
        compact
      />

      {fields.frequency === "every_n_days" && (
        <div className="field narrow">
          <label className="field-label" htmlFor="everyDays">
            Every how many days
          </label>
          <input
            id="everyDays"
            type="number"
            min="1"
            max="365"
            className="text-input"
            value={fields.everyDays}
            onChange={(event) =>
              set("everyDays", Math.max(1, Number(event.target.value) || 1))
            }
          />
          {errors.everyDays && <p className="field-error">{errors.everyDays}</p>}
        </div>
      )}

      {fields.frequency === "weekdays" && (
        <ChipGroup
          label="On these days"
          options={WEEKDAY_OPTIONS}
          selected={fields.weekdays}
          onChange={(next) => set("weekdays", next)}
          error={errors.weekdays}
          compact
        />
      )}

      <div className="field-row two">
        <div className="field">
          <label className="field-label" htmlFor="runTime">
            At what time
          </label>
          <input
            id="runTime"
            type="time"
            className="text-input"
            value={fields.runTime}
            onChange={(event) => set("runTime", event.target.value)}
          />
          {errors.runTime && <p className="field-error">{errors.runTime}</p>}
        </div>
        <div className="field">
          <span className="field-label">Timezone</span>
          <p className="static-value">{fields.timezone}</p>
          <p className="field-hint below">Taken from this browser.</p>
        </div>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={fields.skipAlreadySent}
          onChange={(event) => set("skipAlreadySent", event.target.checked)}
        />
        <span>Skip listings this schedule already sent</span>
        <em>Keeps your webhook free of repeats from run to run.</em>
      </label>
    </div>
  );
}
