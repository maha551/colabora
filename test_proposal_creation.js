const fetch = require('node-fetch');

async function testProposalCreation() {
  try {
    console.log('Testing proposal creation...');

    // First login
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
    });

    if (!loginResponse.ok) {
      console.log('Login failed:', loginResponse.status);
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('Logged in successfully');

    // Get organizations
    const orgsResponse = await fetch('http://localhost:3000/api/organizations', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const orgsData = await orgsResponse.json();
    console.log('Found organizations:', orgsData.organizations.length);

    if (orgsData.organizations.length === 0) {
      console.log('No organizations found');
      return;
    }

    const orgId = orgsData.organizations[0].id;
    console.log('Using organization:', orgId);

    // Create proposal
    const createResponse = await fetch(`http://localhost:3000/api/organizations/${orgId}/document-proposals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Proposal from API',
        description: 'Created via API test',
        contributors: [],
        documentOptions: {
          acceptanceThreshold: 75,
          votingAnonymous: false,
          votingAnonymityLocked: false,
          voteChangeAllowed: true,
          structureProposalsEnabled: false
        }
      })
    });

    console.log('Create proposal status:', createResponse.status);

    if (createResponse.ok) {
      const result = await createResponse.json();
      console.log('Proposal created:', result.documentProposal.id);

      // Get proposals
      const proposalsResponse = await fetch(`http://localhost:3000/api/organizations/${orgId}/document-proposals`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const proposalsData = await proposalsResponse.json();
      console.log('Proposals after creation:', proposalsData.documentProposals.length);
      console.log('Latest proposal:', proposalsData.documentProposals[0]?.title);
    } else {
      const error = await createResponse.text();
      console.log('Error creating proposal:', error);
    }

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testProposalCreation();
