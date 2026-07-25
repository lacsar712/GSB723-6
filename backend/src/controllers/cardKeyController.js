const crypto = require('crypto');
const { Op } = require('sequelize');
const { Application, Agent, CardKey, sequelize } = require('../models');

const REVOKE_BATCH_LIMIT = 50;
const REASON_MIN = 5;
const REASON_MAX = 100;
const EXPORT_MAX_ROWS = 5000;

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

// CSV 字段转义（手写，不引入任何依赖）
function escapeCsv(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toIso(v) {
  return v ? new Date(v).toISOString() : '';
}

// 解析日期入参：返回 { value, ok }。空值视为未提供(ok=true,value=undefined)；非法格式 ok=false
function parseDate(input, endOfDay = false) {
  if (input === undefined || input === null || input === '') return { value: undefined, ok: true };
  const raw = String(input).trim();
  // 仅日期(YYYY-MM-DD)时，起始补 00:00:00、结束补 23:59:59.999
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const d = new Date(dateOnly ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : raw);
  if (Number.isNaN(d.getTime())) return { value: undefined, ok: false };
  return { value: d, ok: true };
}

// 列表与导出共用同一套筛选参数构造，禁止两套逻辑分叉。
// 返回 { where } 或 { error } —— 权限隔离(agent_id)在此统一收敛。
function buildListWhere(req) {
  const where = { agent_id: req.agent.id };

  const applicationId = parseInt(req.query.application_id, 10);
  if (Number.isFinite(applicationId)) where.application_id = applicationId;

  const status = (req.query.status || '').trim();
  if (['unused', 'used', 'revoked', 'redeemed'].includes(status)) where.status = status;

  const keyword = (req.query.keyword || '').trim();
  if (keyword) where.code = { [Op.like]: `%${keyword}%` };

  const from = parseDate(req.query.revoked_from, false);
  const to = parseDate(req.query.revoked_to, true);
  if (!from.ok || !to.ok) return { error: '作废时间范围格式非法' };
  if (from.value || to.value) {
    where.revoked_at = {};
    if (from.value) where.revoked_at[Op.gte] = from.value;
    if (to.value) where.revoked_at[Op.lte] = to.value;
  }

  return { where };
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

    const built = buildListWhere(req);
    if (built.error) return res.status(400).json({ error: built.error });

    const { count, rows } = await CardKey.findAndCountAll({
      where: built.where,
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

// 导出当前筛选结果为 CSV（UTF-8 BOM）。与列表共用 buildListWhere，受 agent_id 隔离与相同筛选约束。
exports.exportCsv = async (req, res, next) => {
  try {
    const built = buildListWhere(req);
    if (built.error) return res.status(400).json({ error: built.error });

    // 导出上限 5000 行，超限返回 400 并提示缩小筛选
    const totalCount = await CardKey.count({ where: built.where });
    if (totalCount > EXPORT_MAX_ROWS) {
      return res.status(400).json({ error: `导出超过 ${EXPORT_MAX_ROWS} 行，请缩小筛选范围` });
    }

    const rows = await CardKey.findAll({
      where: built.where,
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['id', 'DESC']]
    });

    const header = ['code', 'application', 'status', 'createdAt', 'revoked_at', 'revoke_reason', 'revoked_by_name'];
    const lines = [header.map(escapeCsv).join(',')];
    for (const r of rows) {
      lines.push([
        r.code,
        r.application?.name || '',
        r.status,
        toIso(r.createdAt),
        toIso(r.revoked_at),
        r.revoked_reason || '',
        r.revoked_by_name || ''
      ].map(escapeCsv).join(','));
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="card-keys-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

exports.batchRevoke = async (req, res, next) => {
  try {
    const { ids, reason } = req.body;

    const rawReason = typeof reason === 'string' ? reason.trim() : '';
    // 附录 C：原因过短/过长分开提示（trim 后计长度）；5~100，禁与批量条数上限 50 混用
    if (rawReason.length < REASON_MIN) {
      return res.status(400).json({ error: `作废原因至少需要 ${REASON_MIN} 个字符` });
    }
    if (rawReason.length > REASON_MAX) {
      return res.status(400).json({ error: `作废原因不能超过 ${REASON_MAX} 个字符` });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请先选择未使用的卡密' });
    }

    // 去重并规整为正整数 id
    const uniqueIds = [...new Set(ids.map(v => parseInt(v, 10)).filter(v => Number.isFinite(v) && v > 0))];
    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: '请先选择未使用的卡密' });
    }
    if (uniqueIds.length > REVOKE_BATCH_LIMIT) {
      return res.status(400).json({ error: `单次最多作废 ${REVOKE_BATCH_LIMIT} 条` });
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
          {
            status: 'revoked',
            revoked_at: now,
            revoked_reason: rawReason,
            revoked_by: agent.id,
            revoked_by_name: agent.name
          },
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
      // 本轮规格别名（更严的错误码约定），与旧字段并存，不破坏已上线前端
      success_count: result.succeeded,
      failures: result.failed,
      quota: result.quota
    });
  } catch (err) {
    next(err);
  }
};

// 只读统计：当前登录代理「近 7 日作废成功数」（status=revoked 且 revoked_at 在近 7 天内）
exports.stats = async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const revokedLast7d = await CardKey.count({
      where: {
        agent_id: req.agent.id,
        status: 'revoked',
        revoked_at: { [Op.gte]: since }
      }
    });
    res.json({ revoked_success_last_7d: revokedLast7d, since: since.toISOString() });
  } catch (err) {
    next(err);
  }
};
