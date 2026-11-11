'use strict';

const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const status = document.querySelector('[role="status"]');
  const progress = document.querySelector('progress');
  const recovery = document.querySelector('#setup-recovery');
  const message = document.querySelector('#setup-error');
  const retry = document.querySelector('#setup-retry');
  const copy = document.querySelector('#setup-copy');

  ipcRenderer.on('integral:setup-state', (_event, state) => {
    status.textContent = state.status;
    progress.hidden = Boolean(state.message);
    recovery.hidden = !state.message;
    message.textContent = state.message || '';
    retry.disabled = !state.message;
    copy.textContent = 'Copy diagnostics';
    if (state.message) retry.focus();
  });
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    try {
      if (!await ipcRenderer.invoke('integral:setup-action', 'retry')) retry.disabled = false;
    } catch { retry.disabled = false; }
  });
  copy.addEventListener('click', async () => {
    try {
      if (await ipcRenderer.invoke('integral:setup-action', 'copy')) copy.textContent = 'Copied';
    } catch { copy.textContent = 'Copy failed. Try again'; }
  });
});
