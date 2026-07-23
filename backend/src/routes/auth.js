const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');

router.post('/login', [
  body('name').isString().isLength({ min: 2, max: 80 }).withMessage('账号名长度需为2-80'),
  body('password').isString().notEmpty().withMessage('密码不能为空'),
  validate
], ctrl.login);

router.get('/me', auth, ctrl.me);
router.post('/logout', auth, ctrl.logout);

module.exports = router;
