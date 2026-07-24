const crypto = require('crypto');
const { Op } = require('sequelize');
const { Application, Agent, CardKey, sequelize } = require('../models');

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

const REVOCABLE_STATUS = new Set(['unused']);
const REVOKE_MAX = 50;

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
    const page = parseInt(req.query.page, 10);
    const pageSize = parseInt(req.query.pageSize, 10);

    let realLimit = limit;
    let realOffset = offset;
    if (Number.isFinite(page) && page >= 1 && Number.isFinite(pageSize) && pageSize >= 1) {
      realLimit = Math.min(pageSize, 200);
      realOffset = (page - 1) * realLimit;
    }

    const { application_id, status, keyword } = req.query;

    const where = { agent_id: req.agent.id };
    if (application_id) {
      const id = parseInt(application_id, 10);
      if (Number.isFinite(id) && id > 0) where.application_id = id;
    }
    if (status) {
      const statusList = String(status).split(',').map(s => s.trim()).filter(Boolean);
      if (statusList.length === 1) {
        where.status = statusList[0];
      } else if (statusList.length > 1) {
        where.status = { [Op.in]: statusList };
      }
    }
    if (keyword) {
      const kw = String(keyword).trim();
      if (kw) where.code = { [Op.like]: `%${kw}%` };
    }

    const { rows, count } = await CardKey.findAndCountAll({
      where,
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit: realLimit,
      offset: realOffset,
      distinct: true
    });

    res.json({
      items: rows,
      total: count,
      limit: realLimit,
      offset: realOffset,
      page: Number.isFinite(page) && page >= 1 ? page : Math.floor(realOffset / realLimit) + 1,
      pageSize: realLimit
    });
  } catch (err) {
    next(err);
  }
};

exports.revokeBatch = async (req, res, next) => {
  try {
    const { ids, reason } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请选择要作废的卡密' });
    }
    if (ids.length > REVOKE_MAX) {
      return res.status(400).json({ error: `单次批量作废数量不能超过 ${REVOKE_MAX} 条` });
    }

    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (normalizedReason.length < 5 || normalizedReason.length > 100) {
      return res.status(400).json({ error: '作废原因长度需在 5-100 个字符之间' });
    }

    const invalidIds = ids.filter(id => {
      const n = Number(id);
      return !Number.isFinite(n) || n <= 0 || String(n) !== String(id).trim();
    });
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: '存在非法的卡密ID' });
    }

    const uniqueIds = Array.from(new Set(ids.map(id => Number(id))));

    const result = await sequelize.transaction(async (tx) => {
      const agent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!agent) throw Object.assign(new Error('agent not found'), { status: 404 });

      const cards = await CardKey.findAll({
        where: { id: { [Op.in]: uniqueIds }, agent_id: agent.id },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });

      const cardMap = new Map();
      for (const c of cards) cardMap.set(c.id, c);

      const failures = [];
      const successIds = [];

      for (const id of uniqueIds) {
        const card = cardMap.get(id);
        if (!card) {
          failures.push({ id, reason: '卡密不存在或不属于当前代理' });
          continue;
        }
        if (!REVOCABLE_STATUS.has(card.status)) {
          failures.push({ id, code: card.code, reason: `当前状态 ${card.status} 不允许作废` });
          continue;
        }
        successIds.push(id);
      }

      if (successIds.length > 0) {
        const now = new Date();
        await CardKey.update(
          {
            status: 'revoked',
            revoked_at: now,
            revoked_reason: normalizedReason
          },
          {
            where: { id: { [Op.in]: successIds }, agent_id: agent.id, status: 'unused' },
            transaction: tx
          }
        );

        agent.card_quota_used = Math.max(0, agent.card_quota_used - successIds.length);
        await agent.save({ transaction: tx });
      }

      return {
        success_count: successIds.length,
        failed_count: failures.length,
        failures,
        quota: {
          total: agent.card_quota_total,
          used: agent.card_quota_used,
          reserved: agent.card_quota_reserved,
          remaining: agent.card_quota_total - agent.card_quota_used - agent.card_quota_reserved
        }
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
};
