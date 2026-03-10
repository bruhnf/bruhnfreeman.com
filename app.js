const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const authRouter = require('./routes/auth');
const testRouter = require('./routes/test');
const { handleCall } = require('./voice');
const isAuthenticated = require('./middleware/auth');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/phonetester')
  .then(() => console.log('DB connected'))
  .catch(err => console.error('DB connection error:', err));

// Public routes (landing, signup, privacy, terms, verify-email from auth)
app.use('/', authRouter);

// Protected routes (test, start-test, status)
app.use('/', testRouter);
app.get('/test', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test.html'));
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

app.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  const User = require('./models/user');
  User.findById(req.session.userId, 'username firstName')
    .then(user => {
      if (!user) return res.json({ loggedIn: false });
      res.json({ loggedIn: true, username: user.username, firstName: user.firstName });
    })
    .catch(() => res.json({ loggedIn: false }));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));