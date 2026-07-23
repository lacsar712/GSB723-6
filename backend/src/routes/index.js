const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/agents', require('./agents'));
router.use('/apps', require('./apps'));
router.use('/card-keys', require('./cardKeys'));

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
