"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { privateFile } = require("./receipt");
const { localSession } = require("@integral/desktop-host/local-session");

// Seed the canonical local profile, rather than masking it in the renderer.
// Cloud sign-in supplies a suggestion; local edits remain authoritative.
function createProfileInitializer({ getProfile, authorize, request = fetch, exchange = localSession }) {
  let pending = null;
  async function initialize(runtime) {
    authorize();
    const name = getProfile()?.name?.trim();
    if (!name || name.length > 256) return;
    const marker = path.join(runtime.home, "one-account", "profile-initialized.json");
    if (fs.lstatSync(path.dirname(marker)).isSymbolicLink()) throw new Error("Local profile state needs recovery.");
    try {
      const stat = fs.lstatSync(marker);
      if (stat.isSymbolicLink() || stat.size > 4096) throw new Error("Local profile state needs recovery.");
      const saved = JSON.parse(fs.readFileSync(marker, "utf8"));
      if (saved.v !== 1 || saved.installationId !== runtime.installation_id) throw new Error("Local profile state needs recovery.");
      return;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const session = await exchange(runtime);
    const api = async (route, method = "GET", body) => {
      const response = await request(new URL(route, runtime.web_url), {
        method, redirect: "error", signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error("Local profile could not be initialized.");
      const data = await response.json();
      return data.user || data;
    };
    const user = await api("/api/auth/me");
    if (typeof user.id !== "string") throw new Error("Local profile needs recovery.");
    authorize();
    if (!user.display_name?.trim() || user.display_name === "Owner") {
      const updated = await api("/api/auth/update-profile", "PUT", { display_name: name });
      if (updated.id !== user.id || updated.display_name !== name) throw new Error("Local profile could not be initialized.");
    }
    authorize();
    privateFile(marker, { v: 1, installationId: runtime.installation_id });
  }
  return runtime => {
    if (!pending) pending = initialize(runtime).finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createProfileInitializer };
