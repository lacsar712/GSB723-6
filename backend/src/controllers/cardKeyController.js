const crypto = require('crypto');
const { Application, Agent, CardKey, sequelize } = require('../models');

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

exports.generate = async (req, res, next) => {
  try {
    const { application_id, count } = req.body;
    const n = parseInt(count, 10);
    if (!Number.isFinite(n) || n <= 0 || n > 500) return res.status(400).json({ error: '生成数量必须是 1-500 的整数' });

    const app = await Application.findByPk(application_id, { attributes: ['id', 'name'] });
    if (!app) return res.status(404).json({ error: '应用不存在' });

    const result = await sequelize.transaction(async (tx) => {
      const agent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!agent) throw Object.assign(new Error('agent not found'), { status: 404 });

      const remaining = agent.card_quota_total - agent.card_quota_used - agent.card_quota_reserved;
      if (remaining < n) return { error: '当前账号可用卡密额度不足', status: 400 };

      const codes = [];
      const rows = [];
      const seen = new Set();
      while (codes.length < n) {
        const code = generateCode();
        if (seen.has(code)) continue;
        seen.add(code);
        codes.push(code);
        rows.push({ code, application_id: app.id, agent_id: agent.id, status: 'unused' });
      }

      await CardKey.bulkCreate(rows, { transaction: tx });

      agent.card_quota_used = agent.card_quota_used + n;
      await agent.save({ transaction: tx });

      return { codes };
    });

    if (result?.error) return res.status(result.status).json({ error: result.error });

    res.status(201).json({ application: app, codes: result.codes });
  } catch (err) {
    next(err);
  }
};

exports.listMine = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const rows = await CardKey.findAll({
      where: { agent_id: req.agent.id },
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit,
      offset
    });

    res.json({ items: rows, limit, offset });
  } catch (err) {
    next(err);
  }
};
