const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CardKey = sequelize.define('CardKey', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  application_id: { type: DataTypes.INTEGER, allowNull: false },
  agent_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('unused', 'used', 'revoked', 'redeemed'), allowNull: false, defaultValue: 'unused' },
  redeemed_at: { type: DataTypes.DATE, allowNull: true },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  revoked_reason: { type: DataTypes.STRING(100), allowNull: true },
  revoked_by: { type: DataTypes.INTEGER, allowNull: true },
  revoked_by_name: { type: DataTypes.STRING(80), allowNull: true }
}, {
  tableName: 'card_keys',
  indexes: [
    { unique: true, fields: ['code'] },
    { fields: ['application_id'] },
    { fields: ['agent_id'] },
    { fields: ['status'] }
  ]
});

module.exports = CardKey;
