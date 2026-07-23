const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING(60), allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING(200), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'user'), defaultValue: 'user' }
}, {
  tableName: 'users',
  indexes: [{ unique: true, fields: ['username'] }]
});

module.exports = User;

