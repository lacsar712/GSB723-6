const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CardKey = sequelize.define('CardKey', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  application_id: { type: DataTypes.INTEGER, allowNull: false },
  agent_id: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.ENUM('unused', 'redeemed'), allowNull: false, defaultValue: 'unused' },
  redeemed_at: { type: DataTypes.DATE, allowNull: true }
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
