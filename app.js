const express    = require('express');
const mongoose   = require('mongoose');
const bodyParser = require('body-parser');
const session    = require('express-session');
const { MongoStore } = require('connect-mongo');
const path       = require('path');
const crypto     = require('crypto');
const authRouter = require('./routes/auth');
const testRouter = require('./routes/test');
const userRouter = require('./routes/user');
const subscriptionRouter = require('./routes/subscription');
const rememberMe = require('./middleware/rememberMe');
const { handleCall } = require('./voice');
const isAuthenticated = require('./middleware/auth');
const isPremium = require('./middleware/premium');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/phonetester';
const isProd    = process.env.NODE_ENV === 'production';

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback_secret',
  resave:            false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl:   MONGO_URI,
    ttl:        24 * 60 * 60,   // session TTL: 24 hours (seconds)
    autoRemove: 'native'
  }),
  cookie: {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'lax',
    maxAge:   24 * 60 * 60 * 1000  // 24 hours (ms)
  }
}));

// Restore session from long-lived remember-me cookie if no active session
app.use(rememberMe);

app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(MONGO_URI)
  .then(() => console.log('DB connected'))
  .catch(err => console.error('DB connection error:', err));

// Public routes (landing, signup, privacy, terms, verify-email from auth)
app.use('/', authRouter);

// Subscription routes (API endpoints)
app.use('/', subscriptionRouter);

// Protected routes (test, start-test, status, profile API)
app.use('/', testRouter);
app.use('/', userRouter);

// Premium-protected routes (require both authentication AND premium subscription)
app.get('/test', isAuthenticated, isPremium, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
});

// Member-only routes (require authentication only)
app.get('/subscribe', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subscribe.html'));
});
app.get('/profile', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});
app.get('/settings', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// Webhook (public for Twilio)
app.post('/twilio-voice', handleCall);

// Additional public static pages
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get("/sms-compliance", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sms-compliance.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const User = require('./models/user');
  User.findById(req.session.userId, 'username firstName avatarUrl isPremium premiumSince')
    .then(user => {
      if (!user) return res.json({ loggedIn: false });
      res.json({ 
        loggedIn: true, 
        username: user.username, 
        firstName: user.firstName, 
        avatarUrl: user.avatarUrl || '',
        isPremium: user.isPremium || false,
        premiumSince: user.premiumSince || null
      });
    })
    .catch(() => res.json({ loggedIn: false }));
});

app.post('/logout', async (req, res) => {
  // Remove the specific remember-me token from the DB
  try {
    const rememberCookie = (() => {
      const header = req.headers.cookie || '';
      for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === 'bf_remember')
          return decodeURIComponent(part.slice(eq + 1).trim());
      }
      return null;
    })();

    if (rememberCookie && req.session.userId) {
      const selector = rememberCookie.split(':')[0];
      if (selector) {
        const User = require('./models/user');
        await User.findByIdAndUpdate(req.session.userId, {
          $pull: { rememberTokens: { selector } }
        });
      }
    }
  } catch (e) { /* ignore — session destroy proceeds regardless */ }

  req.session.destroy(() => {
    res.clearCookie('bf_remember', { path: '/' });
    res.redirect('/');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
