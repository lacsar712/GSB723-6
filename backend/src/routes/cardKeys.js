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

router.post('/revoke-batch', auth, [
  body('ids').isArray({ min: 1, max: 50 }).withMessage('请选择 1-50 条卡密'),
  body('ids.*').isInt({ min: 1 }).withMessage('卡密ID不合法'),
  body('reason').isString().trim().isLength({ min: 5, max: 100 }).withMessage('作废原因长度需在 5～100 个字符之间'),
  validate
], ctrl.revokeBatch);

module.exports = router;
