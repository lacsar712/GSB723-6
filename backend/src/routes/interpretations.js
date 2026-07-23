const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/interpretationController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');

router.get('/', ctrl.list);
router.get('/by-clause', ctrl.getByClause);
router.get('/:id', ctrl.getById);

router.post('/', auth, [
  body('title').notEmpty().withMessage('标题不能为空'),
  body('type').isIn(['video', 'article']).withMessage('类型无效'),
  validate
], ctrl.create);

module.exports = router;
