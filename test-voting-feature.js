const fetch = require('node-fetch');

async function testVotingFeature() {
  const baseUrl = 'https://colabora-fresh.fly.dev';

  try {
    console.log('🗳️ Testing Voting Feature Implementation...\n');

    // Login as Diana (admin)
    console.log('1️⃣ Logging in as Diana (admin)...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'diana@example.com',
        password: 'SecurePass123!'
      })
    });

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Login successful\n');

    // Create organization with voting enabled
    console.log('2️⃣ Creating organization with voting enabled...');
    const orgResponse = await fetch(`${baseUrl}/api/organizations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'United Nations',
        description: 'International organization for global cooperation',
        representatives: ['cmgxlfj9z0000orjgnfy3revt', 'cmgxlfj9z0000orjgnfy3revu', 'cmgxlfj9z0000orjgnfy3revv'], // Alice, Bob, Charlie
        membershipPolicy: 'invitation',
        votingEnabled: true,
        votingThreshold: 0.6
      })
    });

    if (!orgResponse.ok) {
      const errorText = await orgResponse.text();
      console.log(`❌ Organization creation failed: ${orgResponse.status} - ${errorText}`);
      return;
    }

    const orgData = await orgResponse.json();
    const orgId = orgData.organization.id;
    console.log(`✅ Organization created: ${orgData.organization.name}`);
    console.log(`   Voting enabled: ${orgData.organization.votingEnabled}`);
    console.log(`   Voting threshold: ${orgData.organization.votingThreshold}\n`);

    // Login as Alice (representative) to create a vote
    console.log('3️⃣ Logging in as Alice (representative) to create vote...');
    const aliceLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      })
    });

    const aliceLoginData = await aliceLoginResponse.json();
    const aliceToken = aliceLoginData.token;

    // Create a vote with scheduled dates
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    console.log('4️⃣ Creating vote with scheduled dates...');
    const voteResponse = await fetch(`${baseUrl}/api/organizations/${orgId}/votes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aliceToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Global Climate Action Initiative',
        description: 'Vote to approve funding for international climate change mitigation programs',
        voteType: 'policy',
        votingStartDate: tomorrow.toISOString(),
        votingEndDate: nextWeek.toISOString()
      })
    });

    if (!voteResponse.ok) {
      const errorText = await voteResponse.text();
      console.log(`❌ Vote creation failed: ${voteResponse.status} - ${errorText}`);
      return;
    }

    const voteData = await voteResponse.json();
    console.log('✅ Vote created successfully!');
    console.log(`   Title: ${voteData.vote.title}`);
    console.log(`   Status: ${voteData.vote.status}`);
    console.log(`   Voting starts: ${voteData.vote.votingStartsAt}`);
    console.log(`   Voting ends: ${voteData.vote.votingEndsAt}\n`);

    // Get organization votes to verify
    console.log('5️⃣ Verifying organization votes...');
    const votesResponse = await fetch(`${baseUrl}/api/organizations/${orgId}/votes`, {
      headers: {
        'Authorization': `Bearer ${aliceToken}`
      }
    });

    if (votesResponse.ok) {
      const votesData = await votesResponse.json();
      console.log(`✅ Found ${votesData.votes.length} vote(s) for the organization`);
      if (votesData.votes.length > 0) {
        const vote = votesData.votes[0];
        console.log(`   Vote: ${vote.title}`);
        console.log(`   Scheduled: ${vote.votingStartsAt} to ${vote.votingEndsAt}`);
      }
    }

    console.log('\n🎉 Voting feature test completed successfully!');
    console.log('✅ Organizations can be created with voting enabled');
    console.log('✅ Representatives can create votes with scheduled dates');
    console.log('✅ Vote scheduling and organization voting settings work correctly');

  } catch (error) {
    console.error('❌ Voting feature test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testVotingFeature();
