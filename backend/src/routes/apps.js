const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const ctrl = require('../controllers/appController');

router.get('/', auth, ctrl.list);

router.post('/', auth, [
  body('name').isString().isLength({ min: 2, max: 80 }).withMessage('应用名称长度需为2-80'),
  body('description').optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage('描述过长'),
  validate
], ctrl.create);

module.exports = router;
