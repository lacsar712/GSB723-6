const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StandardFile = sequelize.define('StandardFile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(100), allowNull: false, comment: '文件编号' },
  name: { type: DataTypes.STRING(500), allowNull: false, comment: '文件名称' },
  category_level1: { type: DataTypes.ENUM('国家标准', '地方标准', '行业标准'), allowNull: false },
  category_level2: { type: DataTypes.STRING(200), allowNull: true, comment: '二级分类' },
  category_level3: { type: DataTypes.STRING(200), allowNull: true, comment: '三级分类' },
  publisher: { type: DataTypes.STRING(200), allowNull: true, comment: '发布机构' },
  publish_date: { type: DataTypes.DATEONLY, allowNull: true },
  status: { type: DataTypes.ENUM('生效中', '已废止', '草案'), defaultValue: '生效中' },
  current_version: { type: DataTypes.STRING(20), defaultValue: 'v1.0' },
  file_type: { type: DataTypes.STRING(50), defaultValue: 'PDF', comment: '文件类型' },
  description: { type: DataTypes.TEXT, allowNull: true },
  content_preview: { type: DataTypes.TEXT, allowNull: true, comment: '核心章节预览' },
  keywords: { type: DataTypes.STRING(500), allowNull: true }
}, {
  tableName: 'standard_files',
  indexes: [
    { fields: ['category_level1'] },
    { fields: ['status'] },
    { fields: ['publish_date'] },
    { type: 'FULLTEXT', fields: ['name', 'description', 'keywords'] }
  ]
});

module.exports = StandardFile;
