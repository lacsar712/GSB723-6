const { StandardFile, Interpretation, FAQ } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

exports.search = async (req, res, next) => {
  try {
    const { keyword, publisher, date_from, date_to, file_type, category, status, page = 1, pageSize = 10 } = req.query;
    if (!keyword && !publisher && !date_from && !category) {
      return res.status(400).json({ error: '请至少提供一个检索条件' });
    }
    const where = {};
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } },
        { keywords: { [Op.like]: `%${keyword}%` } },
        { content_preview: { [Op.like]: `%${keyword}%` } }
      ];
    }
    if (publisher) where.publisher = { [Op.like]: `%${publisher}%` };
    if (file_type) where.file_type = file_type;
    if (category) where.category_level1 = category;
    if (status) where.status = status;
    if (date_from || date_to) {
      where.publish_date = {};
      if (date_from) where.publish_date[Op.gte] = date_from;
      if (date_to) where.publish_date[Op.lte] = date_to;
    }

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const { count, rows } = await StandardFile.findAndCountAll({
      where, offset, limit: parseInt(pageSize),
      order: [['publish_date', 'DESC']]
    });

    logger.info('Search performed', { keyword, results: count });
    res.json({ total: count, page: parseInt(page), pageSize: parseInt(pageSize), data: rows });
  } catch (err) { next(err); }
};

exports.globalSearch = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '请输入搜索关键词' });

    const [files, interps, faqs] = await Promise.all([
      StandardFile.findAll({
        where: { [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { code: { [Op.like]: `%${q}%` } },
          { keywords: { [Op.like]: `%${q}%` } }
        ]},
        limit: 5, attributes: ['id', 'code', 'name', 'status', 'category_level1']
      }),
      Interpretation.findAll({
        where: { [Op.or]: [
          { title: { [Op.like]: `%${q}%` } },
          { tags: { [Op.like]: `%${q}%` } }
        ]},
        limit: 5, attributes: ['id', 'title', 'type', 'expert_name']
      }),
      FAQ.findAll({
        where: { [Op.or]: [
          { question: { [Op.like]: `%${q}%` } },
          { answer: { [Op.like]: `%${q}%` } }
        ]},
        limit: 5, attributes: ['id', 'question', 'category']
      })
    ]);

    res.json({ files, interpretations: interps, faqs });
  } catch (err) { next(err); }
};
