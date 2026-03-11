const geoip = require('geoip-lite');
const User = require('../models/user');

const MAX_GEO_RECORDS = 10;
const SUSPICIOUS_DISTANCE_MILES = 500;

// Haversine formula - calculates distance between two GPS coordinates in miles
function distanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Main function - call this directly from routes with userId and trigger
async function recordGeoLocation(req, userId, trigger) {
  try {
    // Get the real IP - handles Nginx proxy
    console.log("GeoTrack IP debug:", req.headers["x-forwarded-for"], req.socket.remoteAddress);
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
               || req.socket.remoteAddress;

    // Skip private/local IPs
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.')
        || ip.startsWith('192.168.')) {
      return;
    }

    // Look up geolocation from local database
    const geo = geoip.lookup(ip);
    if (!geo) return;

    // Load the user
    const user = await User.findById(userId);
    if (!user) return;

    // Check if location is suspicious compared to last record
    let suspiciousLocation = false;
    if (user.geoHistory.length > 0) {
      const last = user.geoHistory[user.geoHistory.length - 1];
      if (last.latitude && last.longitude) {
        const miles = distanceMiles(
          last.latitude, last.longitude,
          geo.ll[0], geo.ll[1]
        );
        if (miles > SUSPICIOUS_DISTANCE_MILES) {
          suspiciousLocation = true;
          console.log(`Suspicious location change for user ${userId}: ${miles.toFixed(0)} miles from last location`);
        }
      }
    }

    // Build the new geo entry
    const entry = {
      ip,
      country:            geo.country,
      region:             geo.region,
      city:               geo.city,
      latitude:           geo.ll[0],
      longitude:          geo.ll[1],
      timezone:           geo.timezone,
      trigger,
      suspiciousLocation,
      recordedAt:         new Date()
    };

    // Add to history and trim to last 10 records
    user.geoHistory.push(entry);
    if (user.geoHistory.length > MAX_GEO_RECORDS) {
      user.geoHistory = user.geoHistory.slice(-MAX_GEO_RECORDS);
    }

    await user.save();

  } catch (err) {
    // Never crash the app over geolocation
    console.error('GeoTrack error:', err.message);
  }
}

module.exports = { recordGeoLocation };
