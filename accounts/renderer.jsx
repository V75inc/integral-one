import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ClerkProvider,
  ClerkLoading,
  ClerkFailed,
  SignIn,
  SignUp,
  useAuth,
} from "@clerk/electron/react";
import { accountAppearance, accountLocalization } from "./appearance";

function AccountLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="status-area">
      <p role="status">
        {slow
          ? "Connecting is taking longer than expected."
          : "Connecting securely…"}
      </p>
      {slow && (
        <>
          <p className="subtitle">Check your connection, then try again.</p>
          <button
            className="action secondary"
            onClick={() => window.integralActivation.restartSignin()}
          >
            Restart sign-in
          </button>
        </>
      )}
    </div>
  );
}
function AccountForm({ returning, onModeChange }) {
  const { isSignedIn, getToken } = useAuth();
  const [signup, setSignup] = useState(!returning);
  const [browserPending, setBrowserPending] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const started = useRef(false);
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await window.integralActivation.register(await getToken());
    } catch {
      setError(
        "We couldn’t finish signing in. Check your connection and use the account linked to this computer, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (isSignedIn && !started.current) {
      started.current = true;
      void finish();
    }
  }, [isSignedIn]);
  if (isSignedIn)
    return (
      <div className="status-area">
        <p role="status">
          {busy ? "Opening Integral One…" : "Ready to continue"}
        </p>
        {error && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="action primary" disabled={busy} onClick={finish}>
              Try again
            </button>
          </>
        )}
      </div>
    );
  return (
    <div
      onClickCapture={(event) => {
        const button = event.target.closest?.("button");
        if (button && /Google|Microsoft/.test(button.textContent || ""))
          setBrowserPending(true);
      }}
    >
      {browserPending && (
        <div className="browser-handoff" role="status">
          <p>Finish signing in in your browser, then return here.</p>
          <p className="handoff-hint">
            Already back, or the browser stopped responding?
          </p>
          <button
            className="text-action"
            onClick={() => window.integralActivation.restartSignin()}
          >
            Restart sign-in
          </button>
        </div>
      )}
      {signup ? (
        <SignUp routing="hash" appearance={accountAppearance} />
      ) : (
        <SignIn routing="hash" appearance={accountAppearance} />
      )}
      <p className="account-switch">
        {signup ? "Already have an account?" : "New to Integral?"}{" "}
        <button
          className="text-action"
          onClick={() => {
            window.location.hash = "";
            setSignup(!signup);
            onModeChange(!signup);
          }}
        >
          {signup ? "Sign in" : "Sign up"}
        </button>
      </p>
    </div>
  );
}
function App() {
  const [context, setContext] = useState(null),
    [signup, setSignup] = useState(true);
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [importing, setImporting] = useState(false);
  useEffect(() => {
    window.integralActivation
      .context()
      .then((value) => {
        setContext(value);
        setSignup(!value.returning);
      })
      .catch(() =>
        setError("Signup is unavailable. Close this window and try again."),
      );
  }, []);
  async function importCode() {
    setError("");
    setImporting(true);
    try {
      await window.integralActivation.importReceipt(code.trim());
    } catch {
      setError(
        "That setup code isn’t valid for this computer. Check that you copied the complete code.",
      );
    } finally {
      setImporting(false);
    }
  }
  return (
    <main className="account-page">
      <header
        className={`account-header ${context?.configured && !context.stateError ? "account-header--form" : ""}`}
      >
        <div className="wordmark">
          <img src="/integral-logo.svg" alt="" aria-hidden="true" />
          <span aria-label="Integral One">
            Integral <span className="edition">| one</span>
          </span>
        </div>
        {(!context?.configured || context.stateError) && (
          <>
            <h1>{signup ? "Create your account" : "Welcome back"}</h1>
            <p className="subtitle">
              {signup
                ? "Get started with Integral One."
                : "Sign in to Integral One."}
            </p>
          </>
        )}
      </header>
      <section
        className="account-body"
        aria-label={signup ? "Sign up" : "Sign in"}
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
            {context.configured && !context.stateError ? (
              <ClerkProvider
                publishableKey={context.publishableKey}
                localization={accountLocalization}
                telemetry={false}
              >
                <ClerkLoading>
                  <AccountLoading />
                </ClerkLoading>
                <ClerkFailed>
                  <p className="error" role="alert">
                    Sign-in is unavailable. Check your connection.
                  </p>
                  <button
                    className="action secondary"
                    onClick={() => window.integralActivation.restartSignin()}
                  >
                    Try again
                  </button>
                </ClerkFailed>
                <AccountForm
                  returning={context.returning}
                  onModeChange={setSignup}
                />
              </ClerkProvider>
            ) : (
              <p className="status-area">
                Account signup is unavailable in this preview. Existing local
                data is preserved.
              </p>
            )}
            {context.canContinueOffline && (
              <button
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
          <p>V75 Inc. maintains Integral One. Signup uses Clerk and your chosen sign-in provider for your email, profile and account security. The account service records your first One signup to count distinct users, not ongoing activity.</p>
          <p>A random computer code is sent during setup. Your signed setup record stays here so you can keep working offline. Signing out or deleting an online account does not erase your local workspace; sign-out is not a filesystem lock.</p>
          <p>Optional SDK telemetry is disabled in this desktop signup view. Authentication providers still process connection and security information. Signup does not subscribe you to marketing.</p>
          <p>Your files and records stay local. If you choose hosted AI or another network service, the information needed for that request goes to that service. Signing in never uploads your workspace to Business.</p>
          <p>Privacy or account requests: support@v75inc.com. The full development-preview notice is included as PRIVACY.md with the application and in the repository. Production retention and deletion arrangements must be finalized before launch.</p>
        </div>
      </details>
      {error && !context && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {context && (
        <div className="account-help">
          <details>
            <summary>Setting up an offline computer?</summary>
            <div className="help-content">
              <p>
                On a connected device, open the signup page and enter this
                computer’s code. Paste the returned setup code here.
              </p>
              <p className="portal-address">
                {context.portal || "The signup page is not configured yet."}
              </p>
              <label htmlFor="computer-code">Computer code</label>
              <input
                id="computer-code"
                readOnly
                value={context.installationId || ""}
              />
              <button
                className="action secondary"
                disabled={!context.installationId}
                onClick={() => window.integralActivation.copyInstallation()}
              >
                Copy computer code
              </button>
              <label htmlFor="setup-code">Setup code</label>
              <textarea
                id="setup-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "setup-code-error" : undefined}
              />
              {error && (
                <p className="error" role="alert" id="setup-code-error">
                  {error}
                </p>
              )}
              <button
                className="action primary"
                disabled={!code.trim() || importing}
                onClick={importCode}
              >
                {importing ? "Checking code…" : "Continue"}
              </button>
            </div>
          </details>
          {context.existingData && (!context.returning || context.recoveryNeeded) && (
            <details>
              <summary>Open an existing workspace</summary>
              <div className="help-content">
                <p>
                  Your existing local data can be opened while account setup is
                  being completed.
                </p>
                <button
                  className="action secondary"
                  onClick={() => window.integralActivation.recover()}
                >
                  Open local workspace
                </button>
              </div>
            </details>
          )}
        </div>
      )}
      {context?.environment !== "production" &&
        !context?.configured &&
        context && <p className="environment">Development preview</p>}
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
