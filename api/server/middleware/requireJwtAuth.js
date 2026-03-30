const passport = require('passport');
const { isEnabled } = require('@librechat/api');
const { parseCookiesWithLastValue } = require('~/server/utils/cookies');

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse
 * Switches between JWT and OpenID authentication based on cookies and environment settings
 */
const requireJwtAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const tokenProvider = parseCookiesWithLastValue(cookieHeader).token_provider;

  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return passport.authenticate('openidJwt', { session: false })(req, res, next);
  }

  return passport.authenticate('jwt', { session: false })(req, res, next);
};

module.exports = requireJwtAuth;
