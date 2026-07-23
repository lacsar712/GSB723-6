const crypto = require('crypto');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function computeNameHash(name) {
  return crypto.createHash('sha256').update(normalizeName(name), 'utf8').digest('hex');
}

module.exports = { normalizeName, computeNameHash };
