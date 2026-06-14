require('dotenv').config();

const shared = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './knex/migrations',
  },
};

module.exports = {
  development: {
    ...shared,
  },
  test: {
    ...shared,
  },
  production: {
    ...shared,
  },
};
