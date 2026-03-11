const mongoose = require('mongoose');
const { Schema } = mongoose;

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
  emailToken: String,
  codeWords:  [String],
  attempts:   { type: Number, default: 0 },
  status:     { type: String, enum: ['pending', 'verified', 'success', 'failed'], default: 'pending' },
  optInSMS:   { type: Boolean, default: false },
  createdAt:  { type: Date, default: Date.now },
  lastTestAt: { type: Date, default: null },
  geoHistory: { type: [geoEntrySchema], default: [] }
});

module.exports = mongoose.model('User', userSchema);
