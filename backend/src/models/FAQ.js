const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FAQ = sequelize.define('FAQ', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  question: { type: DataTypes.TEXT, allowNull: false },
  answer: { type: DataTypes.TEXT, allowNull: false },
  category: {
    type: DataTypes.ENUM('标准理解类', '申报操作类', '评估执行类', '使用操作类'),
    allowNull: false
  },
  related_standard: { type: DataTypes.STRING(500), allowNull: true },
  related_links: { type: DataTypes.TEXT, allowNull: true },
  helpful_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  view_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'faqs',
  indexes: [
    { fields: ['category'] }
  ]
});

module.exports = FAQ;
