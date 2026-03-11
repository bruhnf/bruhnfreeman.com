const geoip = require('geoip-lite');
const GeoVisit = require('../models/geovisit');

const MAX_RECORDS = 20;

module.exports = async function geoTrack(req, res, next) {
  try {
    // Get the real IP - handles proxies and load balancers
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() 
               || req.socket.remoteAddress;

    // Skip private/local IPs (your own server, localhost)
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.')
        || ip.startsWith('172.') || ip.startsWith('192.168.')) {
      return next();
    }

    // Look up geolocation from local database - no external API call
    const geo = geoip.lookup(ip);
    if (!geo) return next(); // IP not found in database, skip silently

    // Build the record
    const visit = new GeoVisit({
      ip,
      country: geo.country,
      region:  geo.region,
      city:    geo.city,
      latitude:  geo.ll[0],
      longitude: geo.ll[1],
      timezone:  geo.timezone
    });

    // Save the new record
    await visit.save();

    // Count total records - if over 20, delete the oldest one
    const count = await GeoVisit.countDocuments();
    if (count > MAX_RECORDS) {
      const oldest = await GeoVisit.findOne().sort({ visitedAt: 1 });
      if (oldest) await GeoVisit.deleteOne({ _id: oldest._id });
    }

  } catch (err) {
    // Never block the request even if geolocation fails
    console.error('GeoTrack error:', err.message);
  }

  // Always continue to the next middleware regardless
  next();
};
