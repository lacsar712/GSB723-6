const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sequelize, Agent, Application, CardKey } = require('../models');
const logger = require('../utils/logger');
const { computeNameHash } = require('../utils/nameHash');

async function waitForDB(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await sequelize.authenticate();
      logger.info('Database connection established for seed');
      return;
    } catch (err) {
      logger.warn(`Seed DB connection attempt ${i + 1}/${maxRetries}: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('Unable to connect to database for seeding');
}

function generateCode() {
  return `CK-${crypto.randomBytes(18).toString('hex')}`;
}

async function seed() {
  try {
    await waitForDB();
    await sequelize.sync({ force: true });
    logger.info('Database synced, starting seed...');

    const apps = await Application.bulkCreate([
      { name: '演示应用-A', description: '默认演示应用 A' },
      { name: '演示应用-B', description: '默认演示应用 B' }
    ]);
    logger.info(`Seeded ${apps.length} applications`);

    const adminPassword = process.env.SEED_ADMIN_PASSWORD || '123456';
    const admin = await Agent.create({
      name: 'admin',
      name_hash: computeNameHash('admin'),
      password_hash: await bcrypt.hash(adminPassword, 10),
      priority: 100,
      parent_id: null,
      application_id: apps[0].id,
      card_quota_total: 2000,
      card_quota_reserved: 0,
      card_quota_used: 0
    });

    const agentA = await Agent.create({
      name: 'agent-a',
      name_hash: computeNameHash('agent-a'),
      password_hash: await bcrypt.hash('123456', 10),
      priority: 50,
      parent_id: admin.id,
      application_id: apps[0].id,
      card_quota_total: 400,
      card_quota_reserved: 0,
      card_quota_used: 0
    });

    const agentB = await Agent.create({
      name: 'agent-b',
      name_hash: computeNameHash('agent-b'),
      password_hash: await bcrypt.hash('123456', 10),
      priority: 40,
      parent_id: admin.id,
      application_id: apps[1].id,
      card_quota_total: 300,
      card_quota_reserved: 0,
      card_quota_used: 0
    });

    const agentA1 = await Agent.create({
      name: 'agent-a-1',
      name_hash: computeNameHash('agent-a-1'),
      password_hash: await bcrypt.hash('123456', 10),
      priority: 10,
      parent_id: agentA.id,
      application_id: apps[0].id,
      card_quota_total: 120,
      card_quota_reserved: 0,
      card_quota_used: 0
    });

    await admin.update({ card_quota_reserved: agentA.card_quota_total + agentB.card_quota_total });
    await agentA.update({ card_quota_reserved: agentA1.card_quota_total });
    logger.info('Seeded agents hierarchy');

    const demoCodes = [];
    for (let i = 0; i < 8; i++) demoCodes.push(generateCode());
    await CardKey.bulkCreate(demoCodes.map(code => ({ code, application_id: apps[0].id, agent_id: admin.id, status: 'unused' })));
    // 额外补充不同状态的演示卡密，便于验证按状态筛选（used/revoked 不计入可回补的 used 额度演示）
    await CardKey.bulkCreate([
      { code: generateCode(), application_id: apps[0].id, agent_id: admin.id, status: 'used', redeemed_at: new Date() },
      { code: generateCode(), application_id: apps[1].id, agent_id: admin.id, status: 'used', redeemed_at: new Date() },
      { code: generateCode(), application_id: apps[0].id, agent_id: admin.id, status: 'revoked', revoked_at: new Date(), revoked_reason: '演示：初始作废样例' }
    ]);
    await admin.update({ card_quota_used: demoCodes.length });
    logger.info(`Seeded ${demoCodes.length} unused card keys (+3 mixed status demo) for admin`);

    logger.info('Database seed completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Seed failed:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

seed();
