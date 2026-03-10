const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const User = require('../models/user');
const { sendVerificationEmail } = require('../comms');

function normalizePhone(phone) {
  // Remove non-digits
  phone = phone.replace(/\D/g, '');
  // Assume US: 10 digits → +1xxxxxxxxxx
  if (phone.length === 10) {
    return '+1' + phone;
  } else if (phone.length === 11 && phone.startsWith('1')) {
    return '+' + phone;
  } else if (phone.startsWith('+1') && phone.length === 12) {
    return phone;
  } else {
    // Log and throw for invalid (expand for non-US)
    console.error('Invalid phone format:', phone);
    throw new Error('Invalid phone number format');
  }
}

router.post('/signup', [
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('last_name').trim().notEmpty().withMessage('Last name required'),
  body('username').trim().notEmpty().withMessage('Username required'),
  body('email').isEmail().withMessage('Invalid email'),
  body('phone').matches(/^[0-9]{3}-[0-9]{3}-[0-9]{4}$/).withMessage('Invalid phone format (123-456-7890)'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.redirect(`/?open=signup&error=${encodeURIComponent(errors.array().map(e => e.msg).join(', '))}`);
  }
  let { first_name, last_name, username, email, phone, password, optin } = req.body;
  try {
    phone = normalizePhone(phone);  // Normalize to E.164
    let user = await User.findOne({ $or: [{ username }, { email }] });
    if (user) {
      console.log(`Signup attempt with existing email or username: ${email}`);
      return res.redirect('/?open=signup&error=user-exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const token = crypto.randomUUID();
    user = new User({
      firstName: first_name,
      lastName: last_name,
      name: `${first_name} ${last_name}`,
      username,
      email,
      phone,
      password: hashedPassword,
      emailToken: token,
      optInSMS: optin === 'yes'
    });
    await user.save();
    await sendVerificationEmail(email, token);
    console.log(`User signed up and verification email sent: ${email}`);
    res.redirect(`/verify-pending.html?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Signup error:', err);
    res.redirect('/?open=signup&error=signup-failed');
  }
});

router.get('/verify-email', async (req, res) => {
  const { token, email } = req.query;
  try {
    const user = await User.findOne({ email, emailToken: token });
    if (!user) {
      console.log(`Invalid verification token for email: ${email}`);
      return res.redirect('/?open=signup&error=invalid-token');
    }
    user.verified = true;
    user.emailToken = null;
    await user.save();
    req.session.userId = user._id.toString();
    console.log(`User verified and session started: ${email}`);
    res.redirect('/?verify=success');
  } catch (err) {
    console.error('Verification error:', err);
    res.redirect('/?open=signup&error=verify-failed');
  }
});

router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Email or username required'),
  body('password').notEmpty().withMessage('Password required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Login validation errors:', errors.array());
    return res.redirect(`/?open=login&error=${encodeURIComponent(errors.array().map(e => e.msg).join(', '))}`);
  }
  const { identifier, password } = req.body;
  try {
    const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
    if (!user) {
      console.log(`Login attempt with unknown identifier: ${identifier}`);
      return res.redirect('/?open=login&error=invalid-credentials');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log(`Invalid password for identifier: ${identifier}`);
      return res.redirect('/?open=login&error=invalid-credentials');
    }
    if (!user.verified) {
      console.log(`Unverified login attempt: ${identifier}`);
      return res.redirect('/?open=login&error=not-verified');
    }
    req.session.userId = user._id.toString();
    console.log(`User logged in: ${identifier}`);
    res.redirect('/?login=success');
  } catch (err) {
    console.error('Login error:', err);
    res.redirect('/?open=login&error=login-failed');
  }
});

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.json({ ok: false, message: 'Email address required.' });
  }
  try {
    const user = await User.findOne({ email });

    // Always respond OK to avoid user enumeration (don't reveal if email exists)
    if (!user || user.verified) {
      return res.json({ ok: true });
    }

    // Issue a fresh token and resend
    const token = crypto.randomUUID();
    user.emailToken = token;
    await user.save();
    await sendVerificationEmail(email, token);
    console.log(`Verification email resent to: ${email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.json({ ok: false, message: 'Server error. Please try again.' });
  }
});

module.exports = router;