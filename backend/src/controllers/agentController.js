const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Agent, Application, sequelize } = require('../models');
const { computeNameHash } = require('../utils/nameHash');

async function loadChain(agentId, maxDepth = 30) {
  const chain = [];
  let curId = agentId;
  let depth = 0;
  while (depth < maxDepth) {
    const agent = await Agent.findByPk(curId, {
      attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used'],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
    });
    if (!agent) break;
    chain.push(agent);
    if (!agent.parent_id) break;
    curId = agent.parent_id;
    depth += 1;
  }
  return chain.reverse();
}

async function loadSubtree(rootId, maxDepth = 30) {
  const root = await Agent.findByPk(rootId, {
    attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used'],
    include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
  });
  if (!root) return null;

  const nodes = new Map();
  nodes.set(root.id, { ...root.toJSON(), children: [] });

  let frontier = [root.id];
  let depth = 0;
  while (frontier.length && depth < maxDepth) {
    const children = await Agent.findAll({
      where: { parent_id: { [Op.in]: frontier } },
      attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used'],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['priority', 'DESC'], ['id', 'ASC']]
    });

    if (!children.length) break;

    frontier = [];
    for (const child of children) {
      const json = { ...child.toJSON(), children: [] };
      nodes.set(json.id, json);
      frontier.push(json.id);
    }
    depth += 1;
  }

  for (const node of nodes.values()) {
    if (!node.parent_id) continue;
    const parent = nodes.get(node.parent_id);
    if (parent) parent.children.push(node);
  }

  return nodes.get(root.id);
}

exports.createChild = async (req, res, next) => {
  try {
    const { name, password, priority, application_id, card_quota_total } = req.body;
    const name_hash = computeNameHash(name);

    const exists = await Agent.findOne({ where: { name_hash } });
    if (exists) return res.status(409).json({ error: '账号名已存在' });

    const quota = parseInt(card_quota_total, 10);
    if (!Number.isFinite(quota) || quota < 0) return res.status(400).json({ error: '卡密额度必须是非负整数' });

    const pwdHash = await bcrypt.hash(password, 10);

    const created = await sequelize.transaction(async (tx) => {
      const parent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!parent) throw Object.assign(new Error('parent not found'), { status: 404 });

      const remaining = parent.card_quota_total - parent.card_quota_used - parent.card_quota_reserved;
      if (remaining < quota) {
        return { error: '上级可用卡密额度不足', status: 400 };
      }

      const child = await Agent.create({
        name,
        name_hash,
        password_hash: pwdHash,
        priority: parseInt(priority, 10) || 0,
        parent_id: parent.id,
        application_id: application_id || null,
        card_quota_total: quota
      }, { transaction: tx });

      parent.card_quota_reserved = parent.card_quota_reserved + quota;
      await parent.save({ transaction: tx });

      return child;
    });

    if (created?.error) return res.status(created.status).json({ error: created.error });

    const child = await Agent.findByPk(created.id, {
      attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used', 'createdAt'],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
    });
    res.status(201).json(child);
  } catch (err) {
    next(err);
  }
};

exports.updateChild = async (req, res, next) => {
  try {
    const childId = parseInt(req.params.id, 10);
    const result = await sequelize.transaction(async (tx) => {
      const parent = await Agent.findByPk(req.agent.id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!parent) throw Object.assign(new Error('parent not found'), { status: 404 });

      const child = await Agent.findOne({
        where: { id: childId, parent_id: parent.id },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });
      if (!child) return { error: '下级代理不存在', status: 404 };

      const updates = {};

      if (typeof req.body.name === 'string') {
        const name = req.body.name.trim();
        if (name !== child.name) {
          const name_hash = computeNameHash(name);
          const exists = await Agent.findOne({
            where: { name_hash, id: { [Op.ne]: child.id } },
            transaction: tx
          });
          if (exists) return { error: '账号名已存在', status: 409 };
          updates.name = name;
          updates.name_hash = name_hash;
        }
      }

      if (typeof req.body.password === 'string' && req.body.password.length > 0) {
        updates.password_hash = await bcrypt.hash(req.body.password, 10);
      }

      if (req.body.priority !== undefined) {
        updates.priority = parseInt(req.body.priority, 10) || 0;
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'application_id')) {
        updates.application_id = req.body.application_id || null;
      }

      if (req.body.card_quota_total !== undefined) {
        const nextQuota = parseInt(req.body.card_quota_total, 10);
        if (!Number.isFinite(nextQuota) || nextQuota < 0) {
          return { error: '卡密额度必须是非负整数', status: 400 };
        }

        const minQuota = child.card_quota_used + child.card_quota_reserved;
        if (nextQuota < minQuota) {
          return { error: `卡密额度不能小于已用+预留（${minQuota}）`, status: 400 };
        }

        const delta = nextQuota - child.card_quota_total;
        if (delta > 0) {
          const parentRemaining = parent.card_quota_total - parent.card_quota_used - parent.card_quota_reserved;
          if (parentRemaining < delta) {
            return { error: '上级可用卡密额度不足', status: 400 };
          }
        }

        if (delta !== 0) {
          parent.card_quota_reserved = parent.card_quota_reserved + delta;
          if (parent.card_quota_reserved < 0) {
            return { error: '上级额度数据异常', status: 409 };
          }
          await parent.save({ transaction: tx });
        }

        updates.card_quota_total = nextQuota;
      }

      if (Object.keys(updates).length > 0) {
        await child.update(updates, { transaction: tx });
      }

      return { id: child.id };
    });

    if (result?.error) return res.status(result.status).json({ error: result.error });

    const child = await Agent.findByPk(result.id, {
      attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used', 'createdAt'],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }]
    });

    res.json(child);
  } catch (err) {
    next(err);
  }
};

exports.listChildren = async (req, res, next) => {
  try {
    const children = await Agent.findAll({
      where: { parent_id: req.agent.id },
      attributes: ['id', 'name', 'priority', 'parent_id', 'application_id', 'card_quota_total', 'card_quota_reserved', 'card_quota_used', 'createdAt'],
      include: [{ model: Application, as: 'application', attributes: ['id', 'name'] }],
      order: [['priority', 'DESC'], ['id', 'ASC']]
    });
    res.json(children);
  } catch (err) {
    next(err);
  }
};

exports.getHierarchy = async (req, res, next) => {
  try {
    const chain = await loadChain(req.agent.id);
    const tree = await loadSubtree(req.agent.id);
    res.json({ chain, tree });
  } catch (err) {
    next(err);
  }
};
