const {Client} = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect()
  .then(() => client.query('SHOW idle_in_transaction_session_timeout'))
  .then(result => {
    console.log('idle_in_transaction_session_timeout:', result.rows[0].setting);
    return client.query('SHOW statement_timeout');
  })
  .then(result => {
    console.log('statement_timeout:', result.rows[0].setting);
    return client.query('SHOW max_connections');
  })
  .then(result => {
    console.log('max_connections:', result.rows[0].setting);
    client.end();
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
