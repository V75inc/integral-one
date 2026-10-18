'use strict';
function validateWorkspace(raw) {
  const url = new URL(raw);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new Error('Use an HTTPS workspace URL, or HTTP on this computer.');
  }
  return url.href.replace(/\/$/, '');
}

module.exports = { validateWorkspace };
