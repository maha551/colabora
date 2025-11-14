const crypto = require('crypto');

console.log('🔐 GENERATED SECURE SECRETS FOR COLABORA');
console.log('=' .repeat(50));

const sessionSecret = crypto.randomBytes(32).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');

console.log('');
console.log('📋 Copy these to your .env file:');
console.log('');
console.log(`SESSION_SECRET="${sessionSecret}"`);
console.log(`JWT_SECRET="${jwtSecret}"`);

console.log('');
console.log('📋 Or export them as environment variables:');
console.log('');
console.log(`export SESSION_SECRET="${sessionSecret}"`);
console.log(`export JWT_SECRET="${jwtSecret}"`);

console.log('');
console.log('⚠️  IMPORTANT:');
console.log('   - Keep these secrets secure and never commit them to version control');
console.log('   - Use different secrets for development and production');
console.log('   - Store production secrets securely (e.g., Fly.io secrets, AWS Secrets Manager)');
console.log('   - Rotate secrets periodically for security');

console.log('');
console.log('✅ Secrets generated successfully!');
