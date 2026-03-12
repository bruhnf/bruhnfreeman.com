/**
 * rememberMe middleware
 *
 * Checks for a long-lived `bf_remember` cookie on every request.
 * If the session is already active, it does nothing.
 * If not, it validates the split-token cookie against the DB and
 * re-establishes the session automatically (token is rotated on each use).
 *
 * Cookie format:  <selector_hex>:<validator_hex>
 * DB stores:      selector (plain) + SHA-256(validator) — never the raw validator.
 */

const crypto = require('crypto');
const User   = require('../models/user');

// Read a named cookie from the raw header (no cookie-parser required)
function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function setRememberCookie(res, selector, validator, isProd) {
  res.setHeader('Set-Cookie',
    `bf_remember=${encodeURIComponent(selector + ':' + validator)}; ` +
    `HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}` +
    (isProd ? '; Secure' : '')
  );
}

module.exports = async function rememberMe(req, res, next) {
  // Already authenticated — nothing to do
  if (req.session && req.session.userId) return next();

  const cookie = readCookie(req, 'bf_remember');
  if (!cookie) return next();

  const colonIdx = cookie.indexOf(':');
  if (colonIdx === -1) return next();

  const selector  = cookie.slice(0, colonIdx);
  const validator = cookie.slice(colonIdx + 1);
  if (!selector || !validator) return next();

  const isProd = process.env.NODE_ENV === 'production';

  try {
    const user = await User.findOne({
      'rememberTokens.selector': selector
    });

    if (!user) {
      // Selector unknown — clear the stale cookie
      res.clearCookie('bf_remember', { path: '/' });
      return next();
    }

    const entry = user.rememberTokens.find(t => t.selector === selector);

    // Expired
    if (!entry || entry.expires < new Date()) {
      user.rememberTokens = user.rememberTokens.filter(t => t.selector !== selector);
      await user.save();
      res.clearCookie('bf_remember', { path: '/' });
      return next();
    }

    // Validator mismatch — possible token theft; nuke ALL tokens for this user
    if (entry.validatorHash !== sha256(validator)) {
      user.rememberTokens = [];
      await user.save();
      res.clearCookie('bf_remember', { path: '/' });
      console.warn(`Possible remember-me token theft for user ${user._id}`);
      return next();
    }

    // ── Valid token: re-establish session ─────────────────────────────────────
    req.session.userId = user._id.toString();

    // Rotate the validator (same selector, new secret) to limit replay window
    const newValidator = crypto.randomBytes(32).toString('hex');
    entry.validatorHash = sha256(newValidator);
    entry.expires       = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    entry.userAgent     = req.headers['user-agent'] || '';
    await user.save();

    setRememberCookie(res, selector, newValidator, isProd);
    console.log(`Session restored via remember-me for user: ${user.username}`);
    next();
  } catch (err) {
    console.error('RememberMe middleware error:', err);
    next();
  }
};
