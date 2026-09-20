// A row of toggle buttons. `options` is [{ value, label }] or plain strings.
export default function ChipGroup({
  label,
  hint,
  options,
  selected,
  onChange,
  error,
  allLabel,
  compact = false,
}) {
  const items = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  const toggle = (value) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );

  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      {hint && <p className="field-hint">{hint}</p>}
      <div className={`choice-row ${compact ? "is-compact" : ""}`}>
        {allLabel && (
          <button
            type="button"
            className={`choice ${selected.length === 0 ? "is-on" : ""}`}
            onClick={() => onChange([])}
          >
            {allLabel}
          </button>
        )}
        {items.map((item) => (
          <button
            type="button"
            key={item.value}
            className={`choice ${selected.includes(item.value) ? "is-on" : ""}`}
            onClick={() => toggle(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
