import { Knex } from 'knex';
import { config } from 'dotenv';

// Load environment variables
config();

const baseConfig: Knex.Config = {
  client: 'postgresql',
  migrations: {
    directory: './src/database/migrations',
    tableName: 'knex_migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './src/database/seeds',
    extension: 'ts',
  },
};

const configurations: { [key: string]: Knex.Config } = {
  development: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'lms_users',
      user: process.env.DB_USER || 'lms_user',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
    debug: true,
  },
  
  test: {
    ...baseConfig,
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME_TEST || 'lms_users_test',
      user: process.env.DB_USER || 'lms_user',
      password: process.env.DB_PASSWORD || 'password',
      ssl: false,
    },
    pool: {
      min: 1,
      max: 5,
    },
  },
  
  production: {
    ...baseConfig,
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    },
    acquireConnectionTimeout: 60000,
  },
};

export default configurations;
