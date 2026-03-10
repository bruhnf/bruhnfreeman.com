// middleware/auth.js  (new file)
  module.exports = function isAuthenticated(req, res, next) {
    if (req.session.userId) return next();
    res.redirect('/?open=login');
  };