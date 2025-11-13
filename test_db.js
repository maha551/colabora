const sqlite3 = require('sqlite3').verbose();
const { verifyPassword } = require('./server/middleware/auth');

async function testDB() {
  const db = new sqlite3.Database('./colabora.db');

  db.get('SELECT id, name, email, password_hash FROM users WHERE email = ?', ['alice@example.com'], async (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return;
    }

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('User found:', user.name, user.email);
    console.log('Hashed password from DB:', user.password_hash);

    const isValid = await verifyPassword('SecurePass123!', user.password_hash);
    console.log('Password verification result:', isValid);

    db.close();
  });
}

testDB();
