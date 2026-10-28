/**
 * Host & Origin Security Middleware (DNS Rebinding and CSRF Protection)
 */

function safeGetUrlHost(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).host;
  } catch {
    return null;
  }
}

function safeGetUrlOrigin(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).origin;
  } catch {
    return null;
  }
}

function validateHostAndOrigin(req, res, next) {
  const host = (req.headers.host || '').toLowerCase();
  const hostname = host.split(':')[0];
  const origin = req.headers.origin;

  // Allow localhost / 127.0.0.1 or configured BASE_URL host
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  const configuredHost = safeGetUrlHost(process.env.BASE_URL);

  if (!isLocalHost) {
    if (!configuredHost || (host !== configuredHost && hostname !== configuredHost.split(':')[0])) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid Host Header' });
    }
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isLocalOrigin = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
      const configuredOrigin = safeGetUrlOrigin(process.env.BASE_URL);
      if (!isLocalOrigin && configuredOrigin && origin !== configuredOrigin) {
        return res.status(403).json({ success: false, error: 'Forbidden: Cross-Origin Request Blocked' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Forbidden: Malformed Origin Header' });
    }
  }

  next();
}

module.exports = {
  safeGetUrlHost,
  safeGetUrlOrigin,
  validateHostAndOrigin
};
