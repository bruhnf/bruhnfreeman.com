const mongoose = require('mongoose');

const geoVisitSchema = new mongoose.Schema({
  ip: { type: String },
  country: { type: String },
  region: { type: String },
  city: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  timezone: { type: String },
  visitedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GeoVisit', geoVisitSchema);
