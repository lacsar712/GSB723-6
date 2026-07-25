const crypto = require('crypto');
const { Op } = require('sequelize');
const { Application, Agent, CardKey, sequelize } = require('../models');

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

const REVOCABLE_STATUS = new Set(['unused']);
const REVOKE_MAX = 50;
const EXPORT_MAX = 5000;

function buildWhereClause(query, agentId) {
  const where = { agent_id: agentId };
  const { application_id, status, keyword, revoked_from, revoked_to } = query;

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

  if (revoked_from || revoked_to) {
    const dateCond = {};
    if (revoked_from) {
      const d = new Date(revoked_from);
      if (isNaN(d.getTime())) {
        return { error: '作废起始日期格式错误（应为 YYYY-MM-DD）' };
      }
      dateCond[Op.gte] = d;
    }
    if (revoked_to) {
      const d = new Date(revoked_to + 'T23:59:59');
      if (isNaN(d.getTime())) {
        return { error: '作废结束日期格式错误（应为 YYYY-MM-DD）' };
      }
      dateCond[Op.lte] = d;
    }
    where.revoked_at = dateCond;
    if (!where.status) {
      where.status = 'revoked';
    }
  }

  return { where };
}

const STATUS_TEXT = {
  unused: '未使用',
  used: '已使用',
  redeemed: '已使用',
  revoked: '已作废'
};

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows) {
  const header = ['code', 'application', 'status', 'createdAt', 'revoked_at', 'revoked_reason', 'revoked_by'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.code),
      csvEscape(r.application?.name || ''),
      csvEscape(STATUS_TEXT[r.status] || r.status || ''),
      csvEscape(r.createdAt ? new Date(r.createdAt).toISOString() : ''),
      csvEscape(r.revoked_at ? new Date(r.revoked_at).toISOString() : ''),
      csvEscape(r.revoked_reason || ''),
      csvEscape(r.revoked_by || '')
    ].join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
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
    const page = parseInt(req.query.page, 10);
    const pageSize = parseInt(req.query.pageSize, 10);

    let realLimit = limit;
    let realOffset = offset;
    if (Number.isFinite(page) && page >= 1 && Number.isFinite(pageSize) && pageSize >= 1) {
      realLimit = Math.min(pageSize, 200);
      realOffset = (page - 1) * realLimit;
    }

    const built = buildWhereClause(req.query, req.agent.id);
    if (built.error) return res.status(400).json({ error: built.error });

    const { rows, count } = await CardKey.findAndCountAll({
      where: built.where,
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

exports.revokeStats = async (req, res, next) => {
  try {
    let days = parseInt(req.query.days, 10);
    if (!Number.isFinite(days) || days < 1) days = 7;
    if (days > 90) days = 90;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const count = await CardKey.count({
      where: {
        agent_id: req.agent.id,
        status: 'revoked',
        revoked_at: { [Op.gte]: since }
      }
    });

    res.json({ days, since: since.toISOString(), count });
  } catch (err) {
    next(err);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const built = buildWhereClause(req.query, req.agent.id);
    if (built.error) return res.status(400).json({ error: built.error });

    const totalCount = await CardKey.count({ where: built.where });
    if (totalCount > EXPORT_MAX) {
      return res.status(400).json({
        error: `当前筛选结果共 ${totalCount} 条，超过导出上限 ${EXPORT_MAX} 条，请缩小筛选范围后重试`
      });
    }

    const rows = await CardKey.findAll({
      where: built.where,
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']],
      limit: EXPORT_MAX
    });

    const csv = toCsv(rows);
    const filename = `card-keys-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
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
            revoked_by: agent.name,
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
