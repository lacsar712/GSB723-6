const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/agentController');

router.post('/', auth, [
  body('name').isString().trim().isLength({ min: 2, max: 80 }).withMessage('账号名长度需为2-80'),
  body('password').isString().isLength({ min: 6, max: 100 }).withMessage('密码长度需为6-100'),
  body('priority').optional().isInt({ min: -999999, max: 999999 }).withMessage('优先级必须是整数'),
  body('application_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('应用ID不合法'),
  body('card_quota_total').isInt({ min: 0, max: 100000000 }).withMessage('卡密额度必须是非负整数'),
  validate
], ctrl.createChild);

router.put('/:id', auth, [
  param('id').isInt({ min: 1 }).withMessage('代理ID不合法'),
  body('name').optional().isString().trim().isLength({ min: 2, max: 80 }).withMessage('账号名长度需为2-80'),
  body('password').optional({ checkFalsy: true }).isString().isLength({ min: 6, max: 100 }).withMessage('密码长度需为6-100'),
  body('priority').optional().isInt({ min: -999999, max: 999999 }).withMessage('优先级必须是整数'),
  body('application_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('应用ID不合法'),
  body('card_quota_total').optional().isInt({ min: 0, max: 100000000 }).withMessage('卡密额度必须是非负整数'),
  validate
], ctrl.updateChild);

router.get('/children', auth, ctrl.listChildren);
router.get('/hierarchy', auth, ctrl.getHierarchy);

module.exports = router;
