const { validationResult } = require('express-validator');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: '参数校验失败',
      details: errors.array().map(e => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};
