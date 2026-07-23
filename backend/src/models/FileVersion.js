const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FileVersion = sequelize.define('FileVersion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  file_id: { type: DataTypes.INTEGER, allowNull: false },
  version: { type: DataTypes.STRING(20), allowNull: false },
  change_log: { type: DataTypes.TEXT, allowNull: true },
  publish_date: { type: DataTypes.DATEONLY, allowNull: true },
  status: { type: DataTypes.ENUM('当前版本', '历史版本'), defaultValue: '当前版本' },
  storage_type: { type: DataTypes.ENUM('remote', 'upload', 'cache'), defaultValue: 'remote' },
  source_url: { type: DataTypes.STRING(1000), allowNull: true },
  source_name: { type: DataTypes.STRING(300), allowNull: true },
  stored_path: { type: DataTypes.STRING(600), allowNull: true },
  file_name: { type: DataTypes.STRING(300), allowNull: true },
  mime_type: { type: DataTypes.STRING(120), allowNull: true },
  file_size: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'file_versions'
});

module.exports = FileVersion;
