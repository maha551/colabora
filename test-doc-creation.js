#!/usr/bin/env node

/**
 * Simple test script to verify document creation works
 */

const request = require('supertest');

async function testDocumentCreation() {
  console.log('🧪 Testing document creation...');

  try {
    // Start test server
    const startTestServer = require('./server/index');
    const server = await startTestServer({ port: 3004, returnServer: true });

    console.log('✅ Server started on port:', server.address().port);

    // Login
    console.log('🔐 Logging in...');
    const loginResponse = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'SecurePass123!'
      });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed: ${loginResponse.status} - ${loginResponse.text}`);
    }

    const authToken = loginResponse.body.token;
    console.log('✅ Login successful, token received');

    // Create personal document
    console.log('📄 Creating personal document...');
    const docResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Test Document',
        description: 'A test document',
        ownershipType: 'personal'
      });

    console.log('Response status:', docResponse.status);
    console.log('Response body:', JSON.stringify(docResponse.body, null, 2));

    if (docResponse.status === 201) {
      console.log('✅ Personal document creation: SUCCESS');
    } else {
      console.log('❌ Personal document creation: FAILED');
      console.log('Error:', docResponse.text);
    }

    // Create organizational document
    console.log('🏢 Creating organizational document...');

    // First login as admin to create organization
    const adminLoginResponse = await request(server)
      .post('/api/auth/login')
      .send({
        email: 'admin@colabora.local',
        password: 'AdminSecurePass123!'
      });

    if (adminLoginResponse.status !== 200) {
      console.log('❌ Admin login failed');
      return;
    }

    const adminToken = adminLoginResponse.body.token;
    console.log('✅ Admin login successful');

    // Create organization as admin
    const orgResponse = await request(server)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Organization',
        description: 'Test organization for document creation',
        representatives: ['admin@colabora.local', 'alice@example.com', 'bob@example.com']
      });

    if (orgResponse.status !== 201) {
      console.log('❌ Organization creation failed:', orgResponse.text);
      return;
    }

    const orgId = orgResponse.body.organization.id;
    console.log('✅ Organization created:', orgId);

    // Invite Alice to the organization
    const inviteResponse = await request(server)
      .post(`/api/organizations/${orgId}/invite`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'alice@example.com'
      });

    if (inviteResponse.status !== 200) {
      console.log('❌ Invitation failed:', inviteResponse.text);
      return;
    }

    console.log('✅ Alice invited to organization');

    // Get invitations for Alice
    const invitationsResponse = await request(server)
      .get('/api/organizations/invitations')
      .set('Authorization', `Bearer ${authToken}`);

    if (invitationsResponse.status !== 200) {
      console.log('❌ Failed to get invitations:', invitationsResponse.text);
      return;
    }

    const invitation = invitationsResponse.body.invitations.find(inv => inv.organizationId === orgId);
    if (!invitation) {
      console.log('❌ No invitation found for Alice');
      return;
    }

    // Alice accepts the invitation
    const acceptResponse = await request(server)
      .post(`/api/organizations/invitations/${invitation.id}/accept`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'active' });

    if (acceptResponse.status !== 200) {
      console.log('❌ Failed to accept invitation:', acceptResponse.text);
      return;
    }

    console.log('✅ Alice joined organization');

    // Now create organizational document as Alice
    const orgDocResponse = await request(server)
      .post('/api/documents')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Organizational Test Document',
        description: 'A test organizational document',
        ownershipType: 'organizational',
        organizationId: orgId
      });

    console.log('Org doc response status:', orgDocResponse.status);
    if (orgDocResponse.status === 201) {
      console.log('✅ Organizational document creation: SUCCESS');
      console.log('Document:', JSON.stringify(orgDocResponse.body.document, null, 2));
    } else {
      console.log('❌ Organizational document creation: FAILED');
      console.log('Error:', orgDocResponse.text);
    }

    // Close server
    await new Promise((resolve) => {
      server.close(() => {
        console.log('✅ Server closed');
        resolve();
      });
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDocumentCreation();
