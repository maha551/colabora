const fetch = require('node-fetch');

async function testProposalsWithoutAuth() {
  try {
    console.log('Testing document proposal endpoints without auth...');

    // Try to create a proposal without auth (should fail)
    const response = await fetch('http://localhost:3000/api/organizations/test-org/document-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Proposal',
        description: 'Test description',
        contributors: [],
        documentOptions: {}
      })
    });

    console.log('Status:', response.status);
    const data = await response.text();
    console.log('Response:', data);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testProposalsWithoutAuth();
