const { Interpretation, StandardFile } = require('../models');
const logger = require('../utils/logger');

exports.list = async (req, res, next) => {
  try {
    const { type, file_id, page = 1, pageSize = 20 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (file_id) where.file_id = parseInt(file_id);
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const { count, rows } = await Interpretation.findAndCountAll({
      where, offset, limit: parseInt(pageSize),
      include: [{ model: StandardFile, as: 'file', attributes: ['id', 'code', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json({ total: count, page: parseInt(page), pageSize: parseInt(pageSize), data: rows });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const item = await Interpretation.findByPk(req.params.id, {
      include: [{ model: StandardFile, as: 'file', attributes: ['id', 'code', 'name', 'status'] }]
    });
    if (!item) return res.status(404).json({ error: '解读内容不存在' });
    await item.increment('views');
    res.json(item);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const item = await Interpretation.create(req.body);
    logger.info('Interpretation created', { id: item.id, type: item.type });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

exports.getByClause = async (req, res, next) => {
  try {
    const { clause_ref, file_id } = req.query;
    const where = {};
    if (clause_ref) where.clause_ref = { [require('sequelize').Op.like]: `%${clause_ref}%` };
    if (file_id) where.file_id = parseInt(file_id);
    const items = await Interpretation.findAll({
      where,
      include: [{ model: StandardFile, as: 'file', attributes: ['id', 'code', 'name'] }],
      order: [['type', 'ASC'], ['createdAt', 'DESC']]
    });
    res.json(items);
  } catch (err) { next(err); }
};
