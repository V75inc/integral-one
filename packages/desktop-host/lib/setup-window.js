'use strict';

const actionChannel = 'integral:setup-action';
const stateChannel = 'integral:setup-state';

function startupFailure(error) {
  const message = error.message || '';
  if (/API readiness timed out/i.test(message)) return 'The local workspace did not become ready in time.';
  if (/Private PostgreSQL failed to start/i.test(message)) return 'The local database could not start.';
  if (/failed to download|failed to fetch|connection reset|connection refused|network is unreachable|name resolution/i.test(message)) {
    return 'A workspace download was interrupted. Check your connection and try again.';
  }
  if (/took too long|Startup timed out/i.test(message)) return 'Workspace setup took too long.';
  if (/integrity check/i.test(message)) return 'A workspace component failed verification. Reinstall Integral One.';
  return 'The local workspace could not start.';
}

async function recoverableSetup({ window, ipcMain, clipboard, start, version }) {
  const contents = window.webContents;
  let choose;
  let stage;
  let diagnostics;
  function send(state) {
    if (!window.isDestroyed()) contents.send(stateChannel, state);
  }
  const onClosed = () => choose?.(false);
  window.once('closed', onClosed);
  ipcMain.handle(actionChannel, (event, action) => {
    if (window.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame) {
      throw new Error('Untrusted setup window.');
    }
    if (!choose) return false;
    if (action === 'copy') {
      clipboard.writeText(diagnostics);
      return true;
    }
    if (action === 'retry') {
      const retry = choose;
      choose = undefined;
      retry(true);
      return true;
    }
    return false;
  });
  try {
    while (!window.isDestroyed()) {
      stage = 'Checking workspace components…';
      send({ status: stage });
      try {
        return await start(status => {
          stage = status;
          send({ status });
        });
      } catch (error) {
        const message = startupFailure(error);
        // Do not copy raw output, local paths, environment values, or account data.
        diagnostics = [
          `Integral One ${version} (${process.platform} ${process.arch})`,
          `Setup stage: ${stage}`,
          `Failure: ${message}`,
          ...(Number.isInteger(error.exitCode) ? [`Core exit code: ${error.exitCode}`] : []),
          'Local log files: api.log, database.log, supervisor.log',
        ].join('\n');
        if (window.isDestroyed()) return null;
        const retry = await new Promise(resolve => {
          choose = resolve;
          send({ status: 'Workspace setup stopped', message });
        });
        choose = undefined;
        if (!retry) return null;
      }
    }
    return null;
  } finally {
    ipcMain.removeHandler(actionChannel);
    window.removeListener('closed', onClosed);
  }
}

module.exports = { recoverableSetup };
