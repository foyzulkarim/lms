import { config } from './src/config';
import { Knex } from 'knex';

const knexConfig: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: config.database.url || {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
    },
    pool: {
      min: config.database.pool.min,
      max: config.database.pool.max,
    },
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts',
    },
    debug: true,
  },

  test: {
    client: 'postgresql',
    connection: config.database.url || {
      host: config.database.host,
      port: config.database.port,
      database: `${config.database.name}_test`,
      user: config.database.user,
      password: config.database.password,
    },
    pool: {
      min: 1,
      max: 5,
    },
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts',
    },
  },

  production: {
    client: 'postgresql',
    connection: config.database.url || {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
    },
    pool: {
      min: config.database.pool.min,
      max: config.database.pool.max,
    },
    migrations: {
      directory: './src/database/migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: './src/database/seeds',
      extension: 'ts',
    },
    debug: false,
  },
};

export default knexConfig;
