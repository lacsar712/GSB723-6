const crypto = require('crypto');
const { Op } = require('sequelize');
const { Application, Agent, CardKey, sequelize } = require('../models');

const REVOKE_BATCH_LIMIT = 50;
const REASON_MIN = 5;
const REASON_MAX = 100;

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

    const where = { agent_id: req.agent.id };

    const applicationId = parseInt(req.query.application_id, 10);
    if (Number.isFinite(applicationId)) where.application_id = applicationId;

    const status = (req.query.status || '').trim();
    if (['unused', 'used', 'revoked', 'redeemed'].includes(status)) where.status = status;

    const keyword = (req.query.keyword || '').trim();
    if (keyword) where.code = { [Op.like]: `%${keyword}%` };

    const { count, rows } = await CardKey.findAndCountAll({
      where,
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit,
      offset
    });

    res.json({ items: rows, total: count, limit, offset });
  } catch (err) {
    next(err);
  }
};

exports.batchRevoke = async (req, res, next) => {
  try {
    const { ids, reason } = req.body;

    const rawReason = typeof reason === 'string' ? reason.trim() : '';
    if (rawReason.length < REASON_MIN || rawReason.length > REASON_MAX) {
      return res.status(400).json({ error: `作废原因必须为 ${REASON_MIN}~${REASON_MAX} 个字符` });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请至少选择一张卡密' });
    }

    // 去重并规整为正整数 id
    const uniqueIds = [...new Set(ids.map(v => parseInt(v, 10)).filter(v => Number.isFinite(v) && v > 0))];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: '卡密 ID 不合法' });
    }
    if (uniqueIds.length > REVOKE_BATCH_LIMIT) {
      return res.status(400).json({ error: `单次批量作废数量上限为 ${REVOKE_BATCH_LIMIT} 张` });
    }

    const result = await sequelize.transaction(async (tx) => {
      const agent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!agent) throw Object.assign(new Error('agent not found'), { status: 404 });

      // 仅查询当前代理自己名下的卡密
      const cards = await CardKey.findAll({
        where: { id: { [Op.in]: uniqueIds }, agent_id: agent.id },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });

      const foundMap = new Map(cards.map(c => [c.id, c]));
      const failed = [];
      const revocableIds = [];

      for (const id of uniqueIds) {
        const card = foundMap.get(id);
        if (!card) {
          failed.push({ id, reason: '卡密不存在或不属于当前账号' });
          continue;
        }
        if (card.status !== 'unused') {
          failed.push({ id, code: card.code, status: card.status, reason: '仅未使用卡密可作废' });
          continue;
        }
        revocableIds.push(id);
      }

      let succeeded = 0;
      if (revocableIds.length > 0) {
        const now = new Date();
        const [affected] = await CardKey.update(
          { status: 'revoked', revoked_at: now, revoked_reason: rawReason },
          { where: { id: { [Op.in]: revocableIds }, agent_id: agent.id, status: 'unused' }, transaction: tx }
        );
        succeeded = affected;

        // 额度按实际成功作废条数回补，绝不按请求条数盲目回补
        if (succeeded > 0) {
          agent.card_quota_used = Math.max(0, agent.card_quota_used - succeeded);
          await agent.save({ transaction: tx });
        }
      }

      return {
        succeeded,
        failed,
        quota: {
          card_quota_total: agent.card_quota_total,
          card_quota_reserved: agent.card_quota_reserved,
          card_quota_used: agent.card_quota_used
        }
      };
    });

    res.json({
      requested: uniqueIds.length,
      succeeded: result.succeeded,
      failedCount: result.failed.length,
      failed: result.failed,
      quota: result.quota
    });
  } catch (err) {
    next(err);
  }
};
