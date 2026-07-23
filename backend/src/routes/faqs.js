const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/faqController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');

router.get('/categories', ctrl.getCategories);
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

router.post('/', auth, [
  body('question').notEmpty().withMessage('问题不能为空'),
  body('answer').notEmpty().withMessage('答案不能为空'),
  body('category').isIn(['标准理解类', '申报操作类', '评估执行类', '使用操作类']).withMessage('分类无效'),
  validate
], ctrl.create);

router.put('/:id', auth, ctrl.update);
router.post('/:id/helpful', ctrl.markHelpful);

module.exports = router;
