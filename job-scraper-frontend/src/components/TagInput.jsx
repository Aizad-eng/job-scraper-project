import { useId, useState } from "react";

export default function TagInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
  suggestions = [],
  error,
  lowercase = true,
}) {
  const [draft, setDraft] = useState("");
  const id = useId();

  const addTag = (raw) => {
    const tag = lowercase ? raw.trim().toLowerCase() : raw.trim();
    if (!tag || values.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...values, tag]);
    setDraft("");
  };

  const removeTag = (tag) => onChange(values.filter((item) => item !== tag));

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    }
    if (event.key === "Backspace" && !draft && values.length) {
      removeTag(values[values.length - 1]);
    }
  };

  // pasting "a, b, c" adds three tags
  const handlePaste = (event) => {
    const text = event.clipboardData.getData("text");
    if (!text.includes(",") && !text.includes("\n")) return;
    event.preventDefault();
    const parts = text.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
    const next = [...values];
    parts.forEach((part) => {
      const tag = lowercase ? part.toLowerCase() : part;
      if (!next.includes(tag)) next.push(tag);
    });
    onChange(next);
    setDraft("");
  };

  const unusedSuggestions = suggestions.filter(
    (item) => !values.includes(item),
  );

  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {hint && <p className="field-hint">{hint}</p>}

      <div className={`tag-box ${error ? "has-error" : ""}`}>
        {values.map((tag) => (
          <span className="tag" key={tag}>
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => addTag(draft)}
          placeholder={values.length ? "" : placeholder}
        />
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="suggestions">
          {unusedSuggestions.map((item) => (
            <button type="button" key={item} onClick={() => addTag(item)}>
              + {item}
            </button>
          ))}
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
