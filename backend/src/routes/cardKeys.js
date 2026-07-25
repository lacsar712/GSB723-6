const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/cardKeyController');

router.get('/', auth, ctrl.listMine);

router.get('/stats', auth, ctrl.stats);

router.get('/export', auth, ctrl.exportCsv);

router.post('/generate', auth, [
  body('application_id').isInt({ min: 1 }).withMessage('应用ID不合法'),
  body('count').isInt({ min: 1, max: 500 }).withMessage('数量必须是 1-500 的整数'),
  validate
], ctrl.generate);

// 校验（原因长度 / ids 条数≤50 / 空选）全部在控制器内处理，以返回附录 C 精确文案
router.post('/batch-revoke', auth, ctrl.batchRevoke);

module.exports = router;
