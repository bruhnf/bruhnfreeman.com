const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const { sendCodeEmail } = require('../comms');
const { generateCodes } = require('../voice');
const isAuthenticated = require('../middleware/auth');


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

router.post('/start-test', isAuthenticated, [
  body('email').optional().isEmail(),
  body('phone').optional().matches(/^[0-9]{3}-[0-9]{3}-[0-9]{4}$/),
  body('first_name').optional().trim(),
  body('last_name').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Test start validation errors:', errors.array());
    return res.status(400).send(`Invalid input: ${errors.array().map(e => e.msg).join(', ')}`);
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      console.log('Test attempt without user session');
      return res.status(401).send('Unauthorized');
    }
    if (!user.verified) return res.status(403).send('Account not verified');
    let { first_name, last_name, email, phone } = req.body;
    if (first_name && last_name) {
      user.firstName = first_name;
      user.lastName = last_name;
      user.name = `${first_name} ${last_name}`;
    }
    if (email) user.email = email;
    if (phone) user.phone = normalizePhone(phone);  // Normalize if updating
    user.codeWords = generateCodes();
    user.status = 'verified'; // Ready for call
    user.attempts = 0;
    await user.save();
    await sendCodeEmail(user.email, user.codeWords);
    console.log(`Test initiated for user: ${user.email}`);
    res.redirect(`/status?email=${user.email}`);
  } catch (err) {
    console.error('Test start error:', err);
    res.status(500).send('Server error starting test');
  }
});

router.get('/status', isAuthenticated, async (req, res) => {
  const { email } = req.query;
  try {
    const user = await User.findOne({ email });
    if (!user || user._id.toString() !== req.session.userId) {
      console.log(`Unauthorized status access attempt for email: ${email}`);
      return res.status(403).send('Unauthorized');
    }
       if (user.status === 'success') {
         return res.redirect('/test?status=success');
       } else if (user.status === 'failed') {
         return res.redirect('/test?status=failed');
       } else {
         return res.redirect('/test?status=waiting&email=' + encodeURIComponent(email));
       }
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).send('Server error checking status');
  }
});

module.exports = router;