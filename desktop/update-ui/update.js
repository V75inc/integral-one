"use strict";
function render(model) {
  if (!model) return;
  document.getElementById("error").hidden = true;
  document.getElementById("title").textContent = model.title;
  document.getElementById("detail").textContent = model.detail;
  const progress = document.getElementById("progress");
  progress.hidden = model.buttons.length > 0;
  if (Number.isFinite(model.progress)) progress.value = Math.max(0, Math.min(100, model.progress));
  else progress.removeAttribute("value");
  const actions = document.getElementById("actions"); actions.replaceChildren();
  model.buttons.forEach((label, index) => {
    const button = document.createElement("button"); button.textContent = label;
    button.className = index === 0 && model.buttons.length > 1 ? "primary" : "";
    button.addEventListener("click", async () => {
      for (const item of actions.children) item.disabled = true;
      try { await window.integralUpdates.choose(model.id, index); }
      catch { document.getElementById("error").textContent = "This update action is no longer available. Check for updates again."; document.getElementById("error").hidden = false; }
    });
    actions.append(button);
  });
}
window.integralUpdates.onStatus(render);
window.integralUpdates.model().then(render);
