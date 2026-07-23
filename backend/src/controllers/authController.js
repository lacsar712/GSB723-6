const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Agent, Application } = require('../models');
const logger = require('../utils/logger');
const { computeNameHash } = require('../utils/nameHash');

function getJwtSecret() {
  return process.env.JWT_SECRET || 'label-2006-demo-secret';
}

function signToken(agent) {
  return jwt.sign({ sub: agent.id, name: agent.name, priority: agent.priority }, getJwtSecret(), {
    expiresIn: '7d'
  });
}

exports.login = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const name_hash = computeNameHash(name);

    const agent = await Agent.findOne({
      where: { name_hash },
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
    });
    if (!agent) return res.status(401).json({ error: '账号或密码错误' });
    const ok = await bcrypt.compare(password, agent.password_hash);
    if (!ok) return res.status(401).json({ error: '账号或密码错误' });

    const token = signToken(agent);
    logger.info('Agent logged in', { id: agent.id, name: agent.name });
    res.json({
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        priority: agent.priority,
        parent_id: agent.parent_id,
        application: agent.application,
        card_quota_total: agent.card_quota_total,
        card_quota_reserved: agent.card_quota_reserved,
        card_quota_used: agent.card_quota_used
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.agent.id, {
      attributes: [
        'id',
        'name',
        'priority',
        'parent_id',
        'application_id',
        'card_quota_total',
        'card_quota_reserved',
        'card_quota_used',
        'createdAt'
      ],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
    });
    if (!agent) return res.status(404).json({ error: '账号不存在' });
    res.json(agent);
  } catch (err) {
    next(err);
  }
};

exports.logout = async (_req, res, _next) => {
  res.json({ message: 'ok' });
};
