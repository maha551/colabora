const { verifyPassword } = require('./server/middleware/auth');

async function testSpecificHash() {
  try {
    const storedHash = '$2b$12$HrQmy/FKFLhHR/BdIlwbJOn./RTiAvu3/KicN3FiITewYzxtdSYEe';
    const password = 'SecurePass123!';

    console.log('Testing stored hash...');
    console.log('Password:', password);
    console.log('Stored hash:', storedHash);

    const isValid = await verifyPassword(password, storedHash);
    console.log('Verification result:', isValid);

  } catch (error) {
    console.error('Error:', error);
  }
}

testSpecificHash();
