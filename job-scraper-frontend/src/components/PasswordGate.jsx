import { useEffect, useState } from "react";
import {
  getAccessKey,
  setAccessKey,
  verifyAccessKey,
} from "../helpers/apiHelpers.js";

/**
 * Wraps the app. Nothing renders (and no API call is made) until the
 * visitor has entered a password the backend accepts.
 */
export default function PasswordGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Re-check any key we already stored, in case it was revoked.
  useEffect(() => {
    const stored = getAccessKey();
    if (!stored) {
      setChecking(false);
      return;
    }
    verifyAccessKey(stored)
      .then((ok) => setUnlocked(ok))
      .catch(() => setUnlocked(false))
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setChecking(true);
    try {
      const ok = await verifyAccessKey(password);
      if (ok) {
        setAccessKey(password);
        setUnlocked(true);
      } else {
        setError("That password is not correct.");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setChecking(false);
    }
  };

  if (unlocked) return children;

  return (
    <main className="shell">
      <section className="panel gate">
        <div className="panel-head">
          <h1>Job Scraper</h1>
          <p>This tool is private. Enter the password to continue.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="gate-password">
              Password
            </label>
            <input
              id="gate-password"
              className="text-input"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
            {error ? <span className="field-error">{error}</span> : null}
          </div>

          <button
            className="primary"
            type="submit"
            disabled={checking || !password.trim()}
          >
            {checking ? "Checking..." : "Unlock"}
          </button>
        </form>
      </section>
    </main>
  );
}
