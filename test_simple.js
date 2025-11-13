const fetch = require('node-fetch');

async function testSimple() {
  try {
    console.log('Testing health endpoint...');

    const response = await fetch('http://localhost:3000/health');
    console.log('Status:', response.status);
    const data = await response.text();
    console.log('Response:', data);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSimple();
