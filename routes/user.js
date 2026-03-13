const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const isAuthenticated = require('../middleware/auth');

// ── S3 client ─────────────────────────────────────────────────────────────────
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const S3_BUCKET = process.env.AWS_S3_BUCKET;

// ── Avatar upload — buffer in memory, then stream to S3 ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
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

  const ext    = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const s3Key  = `avatars/${req.session.userId}${ext}`;
  const region = process.env.AWS_REGION || 'us-east-1';
  const avatarUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;

  try {
    // If the extension changed, delete the old S3 object
    const user = await User.findById(req.session.userId, 'avatarUrl');
    if (user && user.avatarUrl && user.avatarUrl !== avatarUrl) {
      const oldKey = user.avatarUrl.split('.amazonaws.com/')[1];
      if (oldKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch(() => {});
      }
    }

    // Upload buffer directly to S3
    await s3.send(new PutObjectCommand({
      Bucket:      S3_BUCKET,
      Key:         s3Key,
      Body:        req.file.buffer,
      ContentType: req.file.mimetype,
    }));

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
      const oldKey = user.avatarUrl.split('.amazonaws.com/')[1];
      if (oldKey) {
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldKey })).catch(() => {});
      }
    }

    await User.findByIdAndUpdate(req.session.userId, { avatarUrl: '' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Avatar delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
