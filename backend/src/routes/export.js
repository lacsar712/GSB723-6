const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/exportController');

router.get('/files.csv', ctrl.exportFilesCsv);
router.post('/files.zip', express.json({ limit: '5mb' }), ctrl.exportFilesZip);

module.exports = router;

