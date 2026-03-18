// routes/subscription.js
// Handles premium subscription management

const express = require('express');
const router = express.Router();
const User = require('../models/user');

// GET /api/subscription-status - Get current user's subscription status
router.get('/api/subscription-status', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await User.findById(req.session.userId, 
      'isPremium premiumSince premiumExpiresAt premiumSource verified'
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if premium has expired
    let isPremium = user.isPremium;
    if (user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt < new Date()) {
      // Premium expired - update the flag
      await User.findByIdAndUpdate(req.session.userId, { isPremium: false });
      isPremium = false;
    }

    res.json({
      isPremium,
      premiumSince: user.premiumSince,
      premiumExpiresAt: user.premiumExpiresAt,
      premiumSource: user.premiumSource,
      verified: user.verified
    });
  } catch (err) {
    console.error('Subscription status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/subscribe - Activate premium subscription
router.post('/api/subscribe', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ ok: false, message: 'Not authenticated' });
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    if (!user.verified) {
      return res.status(403).json({ ok: false, message: 'Please verify your email first' });
    }

    if (user.isPremium) {
      return res.json({ ok: true, message: 'Already premium' });
    }

    // Activate premium subscription
    // During beta: free lifetime access with source='beta_free'
    // In production, this would integrate with Stripe or another payment processor
    user.isPremium = true;
    user.premiumSince = new Date();
    user.premiumExpiresAt = null;  // null = lifetime (no expiration)
    user.premiumSource = 'beta_free';

    await user.save();

    console.log(`Premium activated for user: ${user.email} (source: beta_free)`);

    res.json({ 
      ok: true, 
      message: 'Premium subscription activated',
      premiumSince: user.premiumSince
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// POST /api/unsubscribe - Cancel premium subscription (for future use)
router.post('/api/unsubscribe', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ ok: false, message: 'Not authenticated' });
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(404).json({ ok: false, message: 'User not found' });
    }

    if (!user.isPremium) {
      return res.json({ ok: true, message: 'Not currently premium' });
    }

    // Cancel premium subscription
    user.isPremium = false;
    // Keep premiumSince and premiumSource for historical records
    await user.save();

    console.log(`Premium cancelled for user: ${user.email}`);

    res.json({ ok: true, message: 'Premium subscription cancelled' });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

module.exports = router;
