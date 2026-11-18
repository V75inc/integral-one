"use strict";
const LABELS = { available: "Update available", ready: "Restart to update", assisted: "Assisted update required", downloading: "Downloading update", installing: "Preparing update", compatibility: "Update awaiting compatibility", failed: "Update needs attention" };
function mountUpdateIndicator(document, bridge) {
  let state = null, button = null, disposed = false;
  function render() {
    if (disposed) return;
    // A previously composed UI may carry the same One widget. Keep one owner.
    const existing = document.querySelector('.one-update-indicator');
    if (existing && existing !== button) return;
    const rail = document.querySelector('.system-bar-sidebar');
    if (!rail) return;
    if (!button) {
      button = document.createElement('button'); button.type = 'button';
      button.className = 'one-update-indicator';
      button.style.cssText = 'flex-shrink:0;margin:8px 0;padding:8px;min-height:32px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--panel-border);border-radius:8px;color:var(--text);background:var(--nav-hover-bg);text-align:left;cursor:pointer';
      button.addEventListener('click', () => { button.disabled = true; Promise.resolve().then(() => bridge.check()).catch(() => {}).finally(() => { if (button) button.disabled = false; }); });
    }
    const label = LABELS[state?.status];
    // Core renders the account trigger inside a direct footer child. Anchor
    // before that child in both expanded and collapsed rails; its popover is
    // portaled outside the sidebar. Re-evaluate after React replaces it.
    const accountMenus = Array.from(rail.querySelectorAll?.('button[aria-haspopup="menu"][aria-label$=" menu"]') || []);
    let accountFooter = accountMenus.at(-1) || null;
    while (accountFooter && accountFooter.parentNode !== rail) accountFooter = accountFooter.parentNode;
    if (accountFooter) {
      if (button.parentNode !== rail || button.nextElementSibling !== accountFooter) rail.insertBefore(button, accountFooter);
    } else if (button.parentNode !== rail) rail.appendChild(button);
    const title = label ? label + (state.version ? ' (' + state.version + ')' : '') : '';
    // textContent prevents release metadata from becoming executable markup.
    if (button.textContent !== '\u2191 ' + (label || 'Updates')) button.textContent = '\u2191 ' + (label || 'Updates');
    if (button.title !== title) { button.title = title; button.setAttribute('aria-label', title || 'Updates'); }
    if (button.hidden !== !label) button.hidden = !label;
  }
  const change = value => { state = value; render(); };
  let pushed = false;
  const unsubscribe = bridge.onChange(value => { pushed = true; change(value); });
  Promise.resolve(bridge.getState()).then(value => { if (!pushed) change(value); }).catch(() => {});
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(render) : null;
  if (document.body) observer?.observe(document.body, { subtree: true, childList: true });
  return () => { disposed = true; observer?.disconnect(); unsubscribe?.(); button?.remove(); };
}
module.exports = { mountUpdateIndicator };
