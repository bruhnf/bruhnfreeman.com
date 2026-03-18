// middleware/premium.js
// Middleware to protect premium-only content
// Use AFTER isAuthenticated middleware

const User = require('../models/user');

module.exports = async function isPremium(req, res, next) {
  // Must be logged in first (isAuthenticated should run before this)
  if (!req.session.userId) {
    return res.redirect('/?open=login');
  }

  try {
    const user = await User.findById(req.session.userId, 'isPremium premiumExpiresAt verified');
    
    if (!user) {
      return res.redirect('/?open=login');
    }

    // Must be verified
    if (!user.verified) {
      return res.redirect('/?open=login&error=not-verified');
    }

    // Check premium status
    if (!user.isPremium) {
      return res.redirect('/subscribe?reason=not-premium');
    }

    // Check if premium has expired (if expiration date is set)
    if (user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
      // Premium expired - update the flag
      await User.findByIdAndUpdate(req.session.userId, { isPremium: false });
      return res.redirect('/subscribe?reason=expired');
    }

    // User has valid premium access
    next();
  } catch (err) {
    console.error('Premium middleware error:', err);
    return res.redirect('/subscribe?reason=error');
  }
};
