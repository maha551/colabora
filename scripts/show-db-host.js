const u = process.env.DATABASE_URL || '';
const m = u.match(/@([^/]+)/);
console.log('DB_HOST=' + (m ? m[1] : 'none'));
console.log('POSTGRES=' + (u.startsWith('postgres') ? 'yes' : 'no'));
