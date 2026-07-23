const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FileRelation = sequelize.define('FileRelation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  source_file_id: { type: DataTypes.INTEGER, allowNull: false },
  target_file_id: { type: DataTypes.INTEGER, allowNull: false },
  relation_type: {
    type: DataTypes.ENUM('实施细则', '政策解读', '标准补充', '关联标准'),
    allowNull: false
  }
}, {
  tableName: 'file_relations'
});

module.exports = FileRelation;
