const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Agent = sequelize.define('Agent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  name_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(200), allowNull: false },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  parent_id: { type: DataTypes.INTEGER, allowNull: true },
  application_id: { type: DataTypes.INTEGER, allowNull: true },
  card_quota_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  card_quota_reserved: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  card_quota_used: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  tableName: 'agents',
  indexes: [
    { unique: true, fields: ['name_hash'] },
    { fields: ['parent_id'] },
    { fields: ['application_id'] }
  ]
});

module.exports = Agent;
