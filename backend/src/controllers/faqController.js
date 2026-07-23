const { FAQ } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

exports.list = async (req, res, next) => {
  try {
    const { category, keyword, page = 1, pageSize = 20 } = req.query;
    const where = {};
    if (category) where.category = category;
    if (keyword) {
      where[Op.or] = [
        { question: { [Op.like]: `%${keyword}%` } },
        { answer: { [Op.like]: `%${keyword}%` } }
      ];
    }
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const { count, rows } = await FAQ.findAndCountAll({
      where, offset, limit: parseInt(pageSize),
      order: [['helpful_count', 'DESC']]
    });
    res.json({ total: count, page: parseInt(page), pageSize: parseInt(pageSize), data: rows });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const faq = await FAQ.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ error: '问题不存在' });
    await faq.increment('view_count');
    res.json(faq);
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const faq = await FAQ.create(req.body);
    logger.info('FAQ created', { id: faq.id, category: faq.category });
    res.status(201).json(faq);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const faq = await FAQ.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ error: '问题不存在' });
    await faq.update(req.body);
    res.json(faq);
  } catch (err) { next(err); }
};

exports.markHelpful = async (req, res, next) => {
  try {
    const faq = await FAQ.findByPk(req.params.id);
    if (!faq) return res.status(404).json({ error: '问题不存在' });
    await faq.increment('helpful_count');
    res.json({ message: '感谢您的反馈' });
  } catch (err) { next(err); }
};

exports.getCategories = async (req, res, next) => {
  try {
    const categories = await FAQ.findAll({
      attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('category')), 'category']],
      raw: true
    });
    const counts = {};
    for (const c of categories) {
      counts[c.category] = await FAQ.count({ where: { category: c.category } });
    }
    res.json(counts);
  } catch (err) { next(err); }
};
