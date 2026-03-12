const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const isAuthenticated = require('../middleware/auth');

// ── Avatar upload storage ─────────────────────────────────────────────────────
const avatarDir = path.join(__dirname, '../public/uploads/avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.session.userId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
    }
  }
});

// ── GET /api/profile ──────────────────────────────────────────────────────────
router.get('/api/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(
      req.session.userId,
      'firstName lastName username email phone bio fieldOfStudy address websites avatarUrl createdAt'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/profile ─────────────────────────────────────────────────────────
router.post('/api/profile', isAuthenticated, [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('phone').trim().notEmpty().withMessage('Phone is required'),
  body('bio').trim().isLength({ max: 500 }).withMessage('Bio must be 500 characters or fewer')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, lastName, phone, bio, fieldOfStudy, street, city, state, zip } = req.body;

  // Collect website inputs (up to 3), filter blanks
  const rawWebsites = [req.body.w0, req.body.w1, req.body.w2];
  const websites = rawWebsites.map(w => (w || '').trim()).filter(Boolean);

  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.firstName    = firstName;
    user.lastName     = lastName;
    user.name         = `${firstName} ${lastName}`;
    user.phone        = phone;
    user.bio          = bio || '';
    user.fieldOfStudy = fieldOfStudy || '';
    user.address      = {
      street: (street || '').trim(),
      city:   (city   || '').trim(),
      state:  (state  || '').trim(),
      zip:    (zip    || '').trim()
    };
    user.websites = websites;
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/profile/avatar ──────────────────────────────────────────────────
router.post('/api/profile/avatar', isAuthenticated, (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File must be under 5 MB.' : err.message });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const avatarUrl = `/uploads/avatars/${req.session.userId}${ext}`;

  // If the user had a previous avatar with a different extension, remove it
  try {
    const user = await User.findById(req.session.userId, 'avatarUrl');
    if (user && user.avatarUrl && user.avatarUrl !== avatarUrl) {
      const oldPath = path.join(__dirname, '../public', user.avatarUrl);
      fs.unlink(oldPath, () => {}); // ignore errors if file doesn't exist
    }
    await User.findByIdAndUpdate(req.session.userId, { avatarUrl });
    res.json({ ok: true, avatarUrl });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/profile/avatar ────────────────────────────────────────────────
router.delete('/api/profile/avatar', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId, 'avatarUrl');
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.avatarUrl) {
      const filePath = path.join(__dirname, '../public', user.avatarUrl);
      fs.unlink(filePath, () => {}); // remove file; ignore if already gone
    }

    await User.findByIdAndUpdate(req.session.userId, { avatarUrl: '' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
