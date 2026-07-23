const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Interpretation = sequelize.define('Interpretation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING(500), allowNull: false },
  type: { type: DataTypes.ENUM('video', 'article'), allowNull: false },
  file_id: { type: DataTypes.INTEGER, allowNull: true, comment: '关联标准文件ID' },
  expert_name: { type: DataTypes.STRING(100), allowNull: true },
  expert_title: { type: DataTypes.STRING(200), allowNull: true },
  content: { type: DataTypes.TEXT, allowNull: true },
  video_url: { type: DataTypes.STRING(500), allowNull: true },
  duration: { type: DataTypes.STRING(20), allowNull: true, comment: '视频时长' },
  views: { type: DataTypes.INTEGER, defaultValue: 0 },
  tags: { type: DataTypes.STRING(500), allowNull: true },
  clause_ref: { type: DataTypes.STRING(200), allowNull: true, comment: '关联条款编号' }
}, {
  tableName: 'interpretations',
  indexes: [
    { fields: ['type'] },
    { fields: ['file_id'] }
  ]
});

module.exports = Interpretation;
