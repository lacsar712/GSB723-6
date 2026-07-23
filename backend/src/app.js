const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const { sequelize } = require('./models');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = parseInt(process.env.PORT) || 8006;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api', routes);

app.use(errorHandler);

async function startServer() {
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await sequelize.authenticate();
      logger.info('Database connection established');
      await sequelize.sync({ alter: true });
      logger.info('Database models synced');
      break;
    } catch (err) {
      retries++;
      logger.warn(`Database connection attempt ${retries}/${maxRetries} failed: ${err.message}`);
      if (retries >= maxRetries) {
        logger.error('Unable to connect to database after maximum retries');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Backend server running on port ${PORT}`);
  });
}

startServer();
