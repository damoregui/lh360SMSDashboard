// lib/fingerprint.js
const crypto = require('crypto');
function buildFingerprint(msgs) {
  const key = msgs.map(m => `${m.id}|${new Date(m.createdAt).getTime()}|${m.direction}`).join('~');
  return crypto.createHash('sha1').update(key).digest('hex');
}
module.exports = { buildFingerprint };
