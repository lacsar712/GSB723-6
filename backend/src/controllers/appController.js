const { Application } = require('../models');

exports.list = async (req, res, next) => {
  try {
    const apps = await Application.findAll({ order: [['id', 'ASC']] });
    res.json(apps);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const exists = await Application.findOne({ where: { name } });
    if (exists) return res.status(409).json({ error: '应用已存在' });
    const app = await Application.create({ name, description: description || null });
    res.status(201).json(app);
  } catch (err) {
    next(err);
  }
};
