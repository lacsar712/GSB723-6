const crypto = require('crypto');
const { Op } = require('sequelize');
const { Application, Agent, CardKey, sequelize } = require('../models');

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

function buildListFilter(query, agentId) {
  const application_id = query.application_id ? parseInt(query.application_id, 10) : null;
  const status = query.status || null;
  const keyword = (query.keyword || '').trim();
  const revoked_start = (query.revoked_start || '').trim();
  const revoked_end = (query.revoked_end || '').trim();

  const where = { agent_id: agentId };

  if (application_id && Number.isFinite(application_id)) {
    where.application_id = application_id;
  }
  if (status && ['unused', 'used', 'revoked', 'redeemed'].includes(status)) {
    where.status = status;
  }
  if (keyword) {
    where.code = { [Op.like]: `%${keyword}%` };
  }

  const revokedWhere = [];
  if (revoked_start) {
    const startDate = new Date(revoked_start);
    if (isNaN(startDate.getTime())) {
      throw Object.assign(new Error('作废起始日期格式错误'), { status: 400 });
    }
    startDate.setHours(0, 0, 0, 0);
    revokedWhere.push({ [Op.gte]: startDate });
  }
  if (revoked_end) {
    const endDate = new Date(revoked_end);
    if (isNaN(endDate.getTime())) {
      throw Object.assign(new Error('作废结束日期格式错误'), { status: 400 });
    }
    endDate.setHours(23, 59, 59, 999);
    revokedWhere.push({ [Op.lte]: endDate });
  }
  if (revokedWhere.length > 0) {
    where.revoked_at = { [Op.and]: revokedWhere };
  }

  return where;
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function formatDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

const STATUS_LABELS = {
  unused: '未使用',
  used: '已使用',
  redeemed: '已使用',
  revoked: '已作废'
};

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

    const where = buildListFilter(req.query, req.agent.id);

    const { count, rows } = await CardKey.findAndCountAll({
      where,
      include: [
        { model: Application, as: 'application', attributes: ['id', 'name'] },
        { model: Agent, as: 'agent', attributes: ['id', 'name'] }
      ],
      order: [['id', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    res.json({ items: rows, total: count, limit, offset });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
};

exports.exportMine = async (req, res, next) => {
  try {
    const where = buildListFilter(req.query, req.agent.id);

    const count = await CardKey.count({ where });
    if (count > 5000) {
      return res.status(400).json({ error: `当前筛选结果共 ${count} 条，超过导出上限 5000 条，请缩小筛选范围后再导出` });
    }

    const rows = await CardKey.findAll({
      where,
      include: [
        { model: Application, as: 'application', attributes: ['id', 'name'] },
        { model: Agent, as: 'agent', attributes: ['id', 'name'] }
      ],
      order: [['id', 'DESC']]
    });

    const headers = ['卡密(code)', '绑定应用(application)', '状态(status)', '生成时间(createdAt)', '作废时间(revoked_at)', '作废原因(revoke_reason)', '操作人(agent)'];
    const lines = [headers.map(csvEscape).join(',')];

    for (const row of rows) {
      const line = [
        row.code,
        row.application?.name || '',
        STATUS_LABELS[row.status] || row.status,
        formatDate(row.createdAt),
        formatDate(row.revoked_at),
        row.revoke_reason || '',
        row.agent?.name || ''
      ].map(csvEscape).join(',');
      lines.push(line);
    }

    const BOM = '\uFEFF';
    const csvContent = BOM + lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="card-keys-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
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
          const statusLabel = STATUS_LABELS[card.status] || card.status;
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
