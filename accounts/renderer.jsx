import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function ConfiguredSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    return window.integralActivation.onStatus((status) => {
      if (typeof status?.message === "string" && status.message)
        setNotice(status.message);
    });
  }, []);
  function clearStatus() {
    setError("");
    setNotice("");
  }
  async function openBrowser() {
    clearStatus();
    setBusy(true);
    try {
      await window.integralActivation.start();
    } catch {
      setError("The browser could not be opened. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const status = notice || error;
  return (
    <>
      <div className="browser-handoff" role="status">
        <p>Finish signing in in your browser, then return here.</p>
        <p className="handoff-hint">
          Once Integral One opens, you can close the browser tab.
        </p>
        {status ? (
          <p className="error" role="alert">
            {status}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="action primary"
        disabled={busy}
        onClick={openBrowser}
      >
        {busy ? "Opening your browser…" : "Continue in your browser"}
      </button>
      <button
        type="button"
        className="text-action"
        onClick={() => {
          clearStatus();
          window.integralActivation.restartSignin();
        }}
      >
        Restart sign-in
      </button>
    </>
  );
}

function UnconfiguredPreview() {
  return (
    <p className="status-area">
      Account signup is unavailable in this preview. Existing local data is preserved.
    </p>
  );
}

function App() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    window.integralActivation
      .context()
      .then((value) => setContext(value))
      .catch(() =>
        setError("Signup is unavailable. Close this window and try again."),
      );
  }, []);
  const returning = Boolean(context?.returning);
  return (
    <main className="account-page">
      <header className="account-header">
        <div className="wordmark">
          <img src="/integral-logo.svg" alt="" aria-hidden="true" />
          <span aria-label="Integral One">
            Integral <span className="edition">| one</span>
          </span>
        </div>
        <h1>{returning ? "Welcome back" : "Create your account"}</h1>
        <p className="subtitle">
          {returning
            ? "Sign in to Integral One."
            : "Get started with Integral One."}
        </p>
      </header>
      <section
        className="account-body"
        aria-label={returning ? "Sign in" : "Sign up"}
      >
        {!context ? (
          <p className="status-area" role="status">
            Loading your account options…
          </p>
        ) : (
          <>
            {context.stateError && (
              <p className="error" role="alert">
                Your local signup record needs recovery. It has been preserved.
              </p>
            )}
            {context.configured ? (
              <ConfiguredSignIn />
            ) : (
              <UnconfiguredPreview />
            )}
            {context.canContinueOffline && (
              <button
                type="button"
                className="action secondary offline-action"
                onClick={() => window.integralActivation.offline()}
              >
                Continue offline
              </button>
            )}
          </>
        )}
      </section>
      <p className="privacy">
        Your files and records stay on this computer.
        <br />
        After signup, Integral One works offline.
      </p>
      <details className="privacy-details">
        <summary>Privacy and your account</summary>
        <div className="help-content">
          <p>
            V75 Inc. maintains Integral One. Signup uses Logto at
            https://auth.saas.apps.trueselph.com/oidc, and this tenant’s user list includes dev signups.
            Registered-account counts do not measure ongoing activity or completed installations.
          </p>
          <p>
            Your local files stay on this computer. The setup record stays here
            so you can keep working offline. Signing out or deleting the online
            account does not erase your local workspace; sign-out is not a
            filesystem lock.
          </p>
          <p>
            If you choose hosted AI or another network service, the information
            needed for that request goes to that service. Signing in never
            uploads your workspace to Business.
          </p>
          <p>
            Privacy or account requests: support@v75inc.com. The full
            development-preview notice is included as PRIVACY.md with the
            application and in the repository. Production retention and deletion
            arrangements must be finalized before launch.
          </p>
        </div>
      </details>
      {error && !context && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {context &&
        context.existingData &&
        (!context.returning || context.recoveryNeeded) && (
          <div className="account-help">
            <details>
              <summary>Open an existing workspace</summary>
              <div className="help-content">
                <p>
                  Your existing local data can be opened while account setup
                  is being completed.
                </p>
                <button
                  type="button"
                  className="action secondary"
                  onClick={() => window.integralActivation.recover()}
                >
                  Open local workspace
                </button>
              </div>
            </details>
          </div>
        )}
      {context?.environment !== "production" &&
        !context?.configured &&
        context && <p className="environment">Development preview</p>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
