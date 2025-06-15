import { config, databaseConfig } from './src/config/env';

const knexConfig = {
  development: {
    ...databaseConfig,
    debug: config.LOG_SQL_QUERIES,
    migrations: {
      directory: './migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './seeds',
      extension: 'ts'
    }
  },

  test: {
    ...databaseConfig,
    connection: process.env.TEST_DATABASE_URL || databaseConfig.connection,
    migrations: {
      directory: './migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './seeds',
      extension: 'ts'
    }
  },

  production: {
    ...databaseConfig,
    debug: false,
    migrations: {
      directory: './migrations',
      extension: 'ts'
    },
    seeds: {
      directory: './seeds',
      extension: 'ts'
    },
    pool: {
      ...databaseConfig.pool,
      afterCreate: (conn: any, done: any) => {
        // Set timezone to UTC
        conn.query('SET timezone="UTC";', (err: any) => {
          done(err, conn);
        });
      }
    }
  }
};

export default knexConfig;
