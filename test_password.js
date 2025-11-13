const { hashPassword, verifyPassword } = require('./server/middleware/auth');

async function testPassword() {
  try {
    console.log('Testing password functions...');

    const password = 'SecurePass123!';
    console.log('Original password:', password);

    const hash = await hashPassword(password);
    console.log('Hashed password:', hash);

    const isValid = await verifyPassword(password, hash);
    console.log('Password verification result:', isValid);

    const isInvalid = await verifyPassword('wrongpassword', hash);
    console.log('Wrong password verification result:', isInvalid);

  } catch (error) {
    console.error('Error:', error);
  }
}

testPassword();
