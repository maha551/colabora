const fetch = require('node-fetch');

async function testDocumentProposals() {
  const baseUrl = 'http://localhost:3000';

  try {
    console.log('🧪 Testing Document Proposal Feature...\n');

    // Test 1: Health check
    console.log('1️⃣ Testing server health...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    console.log('✅ Server is healthy\n');

    // Test 2: Login as Alice
    console.log('2️⃣ Logging in as Alice...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Logged in successfully\n');

    // Test 3: Get organizations
    console.log('3️⃣ Getting organizations...');
    const orgsResponse = await fetch(`${baseUrl}/api/organizations`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!orgsResponse.ok) {
      throw new Error(`Get organizations failed: ${orgsResponse.status}`);
    }

    const orgsData = await orgsResponse.json();
    console.log(`✅ Found ${orgsData.organizations.length} organizations`);

    if (orgsData.organizations.length === 0) {
      console.log('⚠️ No organizations found. Creating one...');

      // Create organization first
      const createOrgResponse = await fetch(`${baseUrl}/api/organizations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Test Organization',
          description: 'Organization for testing document proposals',
          representatives: ['cmgxlfj9z0000orjgnfy3revt'], // Alice
          membershipPolicy: 'open',
          votingEnabled: true,
          votingThreshold: 0.5
        })
      });

      if (!createOrgResponse.ok) {
        console.log('❌ Could not create organization for testing');
        return;
      }

      const newOrg = await createOrgResponse.json();
      console.log('✅ Created test organization\n');
      orgsData.organizations = [newOrg.organization];
    }

    const testOrg = orgsData.organizations[0];
    console.log(`📋 Using organization: ${testOrg.name} (${testOrg.id})\n`);

    // Test 4: Get document proposals (should be empty initially)
    console.log('4️⃣ Getting document proposals...');
    const proposalsResponse = await fetch(`${baseUrl}/api/organizations/${testOrg.id}/document-proposals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!proposalsResponse.ok) {
      throw new Error(`Get proposals failed: ${proposalsResponse.status}`);
    }

    const proposalsData = await proposalsResponse.json();
    console.log(`✅ Found ${proposalsData.documentProposals.length} existing proposals\n`);

    // Test 5: Create a document proposal
    console.log('5️⃣ Creating document proposal...');
    const createProposalResponse = await fetch(`${baseUrl}/api/organizations/${testOrg.id}/document-proposals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Document Proposal',
        description: 'This is a test document proposal for voting',
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

    if (!createProposalResponse.ok) {
      const errorText = await createProposalResponse.text();
      throw new Error(`Create proposal failed: ${createProposalResponse.status} - ${errorText}`);
    }

    const newProposal = await createProposalResponse.json();
    console.log('✅ Created document proposal\n');

    // Test 6: Vote on the proposal
    console.log('6️⃣ Voting on the proposal...');
    const voteResponse = await fetch(`${baseUrl}/api/organizations/${testOrg.id}/document-proposals/${newProposal.documentProposal.id}/vote`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vote: 'PRO'
      })
    });

    if (!voteResponse.ok) {
      const errorText = await voteResponse.text();
      console.log(`❌ Vote failed: ${voteResponse.status} - ${errorText}`);
    } else {
      console.log('✅ Voted successfully\n');
    }

    // Test 7: Get updated proposals
    console.log('7️⃣ Getting updated proposals...');
    const updatedProposalsResponse = await fetch(`${baseUrl}/api/organizations/${testOrg.id}/document-proposals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!updatedProposalsResponse.ok) {
      throw new Error(`Get updated proposals failed: ${updatedProposalsResponse.status}`);
    }

    const updatedProposalsData = await updatedProposalsResponse.json();
    console.log(`✅ Found ${updatedProposalsData.documentProposals.length} proposals after voting`);

    if (updatedProposalsData.documentProposals.length > 0) {
      const proposal = updatedProposalsData.documentProposals[0];
      console.log(`📊 Proposal status: ${proposal.approved ? 'APPROVED' : 'PENDING'}`);
      console.log(`📊 Votes: ${proposal.votes.length} total`);
      console.log(`📊 Pro votes: ${proposal.votes.filter(v => v.vote === 'PRO').length}`);
    }

    console.log('\n🎉 Document proposal testing completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDocumentProposals();
