const { generateToken } = require('./server/middleware/auth');

function testJWT() {
  try {
    console.log('Testing JWT generation...');

    const user = {
      id: 'cmgxlfj9z0000orjgnfy3revt',
      name: 'Alice Johnson',
      email: 'alice@example.com'
    };

    const token = generateToken(user);
    console.log('Generated token:', token.substring(0, 50) + '...');

  } catch (error) {
    console.error('Error:', error);
  }
}

testJWT();
