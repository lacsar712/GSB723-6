const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/cardKeyController');

router.get('/', auth, ctrl.listMine);

router.post('/generate', auth, [
  body('application_id').isInt({ min: 1 }).withMessage('应用ID不合法'),
  body('count').isInt({ min: 1, max: 500 }).withMessage('数量必须是 1-500 的整数'),
  validate
], ctrl.generate);

module.exports = router;
