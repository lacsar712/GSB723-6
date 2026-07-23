const sequelize = require('../config/database');
const Agent = require('./Agent');
const Application = require('./Application');
const CardKey = require('./CardKey');

Agent.hasMany(Agent, { foreignKey: 'parent_id', as: 'children' });
Agent.belongsTo(Agent, { foreignKey: 'parent_id', as: 'parent' });

Application.hasMany(Agent, { foreignKey: 'application_id', as: 'agents' });
Agent.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

Application.hasMany(CardKey, { foreignKey: 'application_id', as: 'cardKeys' });
CardKey.belongsTo(Application, { foreignKey: 'application_id', as: 'application' });

Agent.hasMany(CardKey, { foreignKey: 'agent_id', as: 'cardKeys' });
CardKey.belongsTo(Agent, { foreignKey: 'agent_id', as: 'agent' });

module.exports = {
  sequelize,
  Agent,
  Application,
  CardKey
};
