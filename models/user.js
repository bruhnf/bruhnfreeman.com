const mongoose = require('mongoose');
const { Schema } = mongoose;

const rememberTokenSchema = new Schema({
  selector:      { type: String, required: true },
  validatorHash: { type: String, required: true }, // SHA-256 of the raw validator
  expires:       { type: Date,   required: true },
  userAgent:     { type: String, default: '' }
}, { _id: false });

const geoEntrySchema = new Schema({
  ip:                 { type: String },
  country:            { type: String },
  region:             { type: String },
  city:               { type: String },
  latitude:           { type: Number },
  longitude:          { type: Number },
  timezone:           { type: String },
  trigger:            { type: String, enum: ['login', 'test'] },
  suspiciousLocation: { type: Boolean, default: false },
  recordedAt:         { type: Date, default: Date.now }
});

const userSchema = new Schema({
  firstName:  { type: String, required: true },
  lastName:   { type: String, required: true },
  name:       { type: String },
  username:   { type: String, unique: true },
  email:      { type: String, required: true, unique: true },
  phone:      { type: String, required: true },
  password:   { type: String, required: true },
  verified:   { type: Boolean, default: false },
  emailToken:        String,
  resetToken:        String,
  resetTokenExpiry:  Date,
  // Profile fields
  bio:               { type: String, default: '' },
  fieldOfStudy:      { type: String, default: '' },
  address: {
    street: { type: String, default: '' },
    city:   { type: String, default: '' },
    state:  { type: String, default: '' },
    zip:    { type: String, default: '' }
  },
  websites:          { type: [String], default: [] },
  avatarUrl:         { type: String, default: '' },
  rememberTokens:    { type: [rememberTokenSchema], default: [] },
  codeWords:  [String],
  attempts:   { type: Number, default: 0 },
  status:     { type: String, enum: ['pending', 'verified', 'success', 'failed'], default: 'pending' },
  // SMS notification preferences (A2P compliant - each off by default, requires explicit opt-in)
  smsPrefs: {
    mfa: {
      enabled:   { type: Boolean, default: false },
      optInAt:   { type: Date, default: null },
      optInIp:   { type: String, default: '' },
      optOutAt:  { type: Date, default: null }
    },
    announcements: {
      enabled:   { type: Boolean, default: false },
      optInAt:   { type: Date, default: null },
      optInIp:   { type: String, default: '' },
      optOutAt:  { type: Date, default: null }
    },
    diagnostics: {
      enabled:   { type: Boolean, default: false },
      optInAt:   { type: Date, default: null },
      optInIp:   { type: String, default: '' },
      optOutAt:  { type: Date, default: null }
    }
  },
  // Legacy SMS opt-in fields (kept for migration, deprecated)
  optInSMS:          { type: Boolean, default: false },
  optInTimestamp:    { type: Date, default: null },
  optInIp:           { type: String, default: '' },
  optInSource:       { type: String, default: '' },
  // Premium subscription fields
  isPremium:         { type: Boolean, default: false },
  premiumSince:      { type: Date, default: null },
  premiumExpiresAt:  { type: Date, default: null },  // null = lifetime/manual
  premiumSource:     { type: String, default: '' },  // 'manual', 'stripe', 'promo', etc.
  createdAt:         { type: Date, default: Date.now },
  lastTestAt: { type: Date, default: null },
  geoHistory: { type: [geoEntrySchema], default: [] }
});

module.exports = mongoose.model('User', userSchema);
