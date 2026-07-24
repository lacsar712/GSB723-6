const crypto = require('crypto');
const { Op } = require('sequelize');
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const application_id = req.query.application_id ? parseInt(req.query.application_id, 10) : null;
    const status = req.query.status || null;
    const keyword = (req.query.keyword || '').trim();

    const where = { agent_id: req.agent.id };
    if (application_id && Number.isFinite(application_id)) {
      where.application_id = application_id;
    }
    if (status && ['unused', 'used', 'revoked'].includes(status)) {
      where.status = status;
    }
    if (keyword) {
      where.code = { [Op.like]: `%${keyword}%` };
    }

    const { count, rows } = await CardKey.findAndCountAll({
      where,
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    res.json({ items: rows, total: count, limit, offset });
  } catch (err) {
    next(err);
  }
};

exports.revokeBatch = async (req, res, next) => {
  try {
    const { ids, reason } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请选择至少一条卡密' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: '单次批量作废数量不能超过 50 条' });
    }

    const trimmedReason = (reason || '').trim();
    if (trimmedReason.length < 5 || trimmedReason.length > 100) {
      return res.status(400).json({ error: '作废原因长度需在 5～100 个字符之间' });
    }

    const bigintIds = ids.map(id => String(id));

    const result = await sequelize.transaction(async (tx) => {
      const agent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!agent) throw Object.assign(new Error('agent not found'), { status: 404 });

      const cards = await CardKey.findAll({
        where: { id: { [Op.in]: bigintIds }, agent_id: agent.id },
        transaction: tx
      });

      const foundMap = new Map(cards.map(c => [String(c.id), c]));

      const failures = [];
      const revokableIds = [];

      for (const id of bigintIds) {
        const card = foundMap.get(id);
        if (!card) {
          failures.push({ id, code: null, reason: '卡密不存在或无权限操作' });
          continue;
        }
        if (card.status !== 'unused') {
          const statusLabel = card.status === 'used' ? '已使用' : card.status === 'revoked' ? '已作废' : card.status;
          failures.push({ id, code: card.code, reason: `当前状态为「${statusLabel}」，不可作废` });
          continue;
        }
        revokableIds.push(card.id);
      }

      let successCount = 0;
      if (revokableIds.length > 0) {
        const now = new Date();
        const [affectedCount] = await CardKey.update(
          { status: 'revoked', revoked_at: now, revoke_reason: trimmedReason },
          {
            where: { id: { [Op.in]: revokableIds }, agent_id: agent.id, status: 'unused' },
            transaction: tx
          }
        );
        successCount = affectedCount;

        agent.card_quota_used = Math.max(0, agent.card_quota_used - successCount);
        await agent.save({ transaction: tx });
      }

      return { successCount, failures, agent: {
        card_quota_total: agent.card_quota_total,
        card_quota_used: agent.card_quota_used,
        card_quota_reserved: agent.card_quota_reserved
      }};
    });

    res.json({
      success_count: result.successCount,
      failures: result.failures,
      agent: result.agent
    });
  } catch (err) {
    next(err);
  }
};
