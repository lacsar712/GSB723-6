const logger = require('../utils/logger');

module.exports = (err, req, res, _next) => {
  logger.error('Unhandled error', {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    stack: err.stack
  });

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: '数据验证失败',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: '数据已存在' });
  }

  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误'
  });
};
