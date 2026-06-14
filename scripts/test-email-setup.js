#!/usr/bin/env node

/**
 * Email setup verification (Resend).
 *
 * Usage:
 *   node scripts/test-email-setup.js
 *   node scripts/test-email-setup.js --test-email=you@example.com
 *
 * On Hetzner (pilot):
 *   kamal app exec -d pilot 'node scripts/test-email-setup.js --test-email=you@example.com'
 */

require('dotenv').config();
const { Resend } = require('resend');
const config = require('../server/config');

function formatFromAddress() {
  const fromEmail = config.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const fromName = config.RESEND_FROM_NAME || 'Colabora';
  return `${fromName} <${fromEmail}>`;
}

function emailDomain(address) {
  const match = String(address).match(/@([^>\s]+)/);
  return match ? match[1].toLowerCase() : null;
}

function frontendRootDomain() {
  try {
    const host = new URL(config.FRONTEND_URL).hostname.toLowerCase();
    const parts = host.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return host;
  } catch {
    return null;
  }
}

console.log('\n📧 Email API Setup Verification\n');
console.log('================================\n');

console.log('1. Checking configuration...\n');

if (!config.RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY is not configured');
  console.error('   Set it in .env, .kamal/secrets, or GitHub Actions secrets.\n');
  process.exit(1);
}

console.log('✅ RESEND_API_KEY is configured');
console.log(`   Key prefix: ${config.RESEND_API_KEY.substring(0, 8)}...\n`);

const fromEmail = config.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const from = formatFromAddress();

if (config.RESEND_FROM_EMAIL) {
  console.log(`✅ RESEND_FROM_EMAIL: ${config.RESEND_FROM_EMAIL}`);
  console.log(`✅ RESEND_FROM_NAME: ${config.RESEND_FROM_NAME || 'Colabora'}`);
  console.log(`   From header: ${from}\n`);

  if (fromEmail === 'onboarding@resend.dev') {
    console.log('⚠️  Still using Resend test sender — only your Resend account email can receive mail.\n');
  } else if (config.NODE_ENV === 'production') {
    const fromDomain = emailDomain(fromEmail);
    const siteRoot = frontendRootDomain();
    if (fromDomain && siteRoot && !fromDomain.endsWith(siteRoot) && !siteRoot.endsWith(fromDomain)) {
      console.log(`⚠️  Sender domain (${fromDomain}) differs from site root (${siteRoot}).`);
      console.log('   That is OK if Resend verified exactly that domain (check resend.com/domains).\n');
    }
  }
} else {
  console.log('⚠️  RESEND_FROM_EMAIL is not set (will use onboarding@resend.dev — testing mode only)\n');
}

console.log(`   FRONTEND_URL: ${config.FRONTEND_URL}`);
console.log('   Invitation links in emails use this URL.\n');

console.log('2. Checking Resend client...\n');

let resend;
try {
  resend = new Resend(config.RESEND_API_KEY);
  console.log('✅ Resend client initialized\n');
} catch (error) {
  console.error('❌ Failed to initialize Resend:', error.message);
  process.exit(1);
}

const testEmailArg = process.argv.find((arg) => arg.startsWith('--test-email='));
const testEmail = testEmailArg ? testEmailArg.split('=').slice(1).join('=') : null;

if (testEmail) {
  console.log('3. Sending test email...\n');
  console.log(`   To: ${testEmail}`);
  console.log(`   From: ${from}\n`);

  (async () => {
    try {
      const result = await resend.emails.send({
        from,
        to: testEmail,
        subject: 'Colabora email test',
        html: `
      <h1>Colabora email test</h1>
      <p>If you received this, Resend is configured correctly.</p>
      <p>Links in real emails will use: <strong>${config.FRONTEND_URL}</strong></p>
      <hr>
      <p style="color:#666;font-size:12px;">Sent ${new Date().toISOString()}</p>
    `,
        text: `Colabora email test\n\nIf you received this, Resend is configured correctly.\nFRONTEND_URL: ${config.FRONTEND_URL}\n`,
      });
      if (result.error) {
        console.error('❌ Resend API error:', result.error.message || result.error);
        if (String(result.error.message || '').includes('verify a domain')) {
          console.error('\n   Set RESEND_FROM_EMAIL to an address on your verified domain.');
          console.error('   Example: noreply@local-correspondent.com\n');
        }
        process.exit(1);
      }
      console.log('✅ Test email accepted by Resend');
      console.log(`   Message ID: ${result.id || result.data?.id || '(see Resend dashboard)'}\n`);
      console.log('   Check inbox and spam. Also see resend.com/emails for delivery status.\n');
    } catch (error) {
      console.error('❌ Error:', error.message);
      if (error.message.includes('only send testing emails to your own email address')) {
        console.error('\n   Domain not in use yet — set RESEND_FROM_EMAIL on your verified domain.\n');
      }
      process.exit(1);
    }
  })();
} else {
  console.log('3. Send test (skipped)\n');
  console.log('   node scripts/test-email-setup.js --test-email=your@email.com');
  console.log('   kamal app exec -d pilot \'node scripts/test-email-setup.js --test-email=your@email.com\'\n');
  console.log('================================\n');
  console.log('✅ Configuration check complete.\n');
}
