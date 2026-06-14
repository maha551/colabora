/**
 * Script to check DATABASE_URL on Fly.io production
 * This script provides commands to verify the DATABASE_URL in production
 */

console.log('🔍 Checking Fly.io DATABASE_URL Configuration\n');
console.log('=====================================\n');

console.log('To check if colabora-app is connected to colabora-db, run these commands:\n');

console.log('1. Check if DATABASE_URL secret is set:');
console.log('   fly secrets list --app colabora-app\n');

console.log('2. List all PostgreSQL databases:');
console.log('   fly postgres list\n');

console.log('3. Check app status (includes database connection info):');
console.log('   fly status --app colabora-app\n');

console.log('4. Test connection from within the app (SSH into app):');
console.log('   fly ssh console --app colabora-app');
console.log('   Then run: node -e "console.log(process.env.DATABASE_URL ? \'✅ DATABASE_URL is set\' : \'❌ DATABASE_URL not set\')"\n');

console.log('5. Check app logs for database connection errors:');
console.log('   fly logs --app colabora-app | grep -i database\n');

console.log('6. Connect to PostgreSQL database directly:');
console.log('   fly postgres connect -a colabora-db\n');
console.log('   (Note: Use -a flag, not --app, for postgres connect)\n');

console.log('=====================================\n');
console.log('Expected Results:\n');
console.log('✅ DATABASE_URL should be in the secrets list');
console.log('✅ DATABASE_URL should start with: postgresql://');
console.log('✅ Database status should show: "Healthy" or "Running"');
console.log('✅ App should be able to connect to the database\n');

console.log('If DATABASE_URL is missing, attach the database:');
console.log('   fly postgres attach --app colabora-app colabora-db\n');

