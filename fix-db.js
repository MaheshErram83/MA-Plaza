const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_9jnwWEGoOvi6@ep-bitter-brook-ayuu174y.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});
async function go() {
  await p.query('CREATE TABLE IF NOT EXISTS houses (id TEXT PRIMARY KEY, name TEXT, created_at BIGINT)');
  await p.query('CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, house_id TEXT, name TEXT, vpa TEXT, created_at BIGINT)');
  await p.query('CREATE TABLE IF NOT EXISTS feed (id TEXT PRIMARY KEY, house_id TEXT, icon TEXT, text TEXT, tone TEXT, created_at BIGINT)');
  await p.query('CREATE TABLE IF NOT EXISTS house_config (house_id TEXT PRIMARY KEY, treasurer_id TEXT, monthly_amount REAL DEFAULT 0)');
  await p.query('CREATE TABLE IF NOT EXISTS contributions (id TEXT PRIMARY KEY, house_id TEXT, member_id TEXT, amount REAL, month_tag TEXT, proof TEXT, created_at BIGINT)');
  await p.query('CREATE TABLE IF NOT EXISTS fund_expenses (id TEXT PRIMARY KEY, house_id TEXT, description TEXT, amount REAL, category TEXT, paid_by TEXT, created_at BIGINT)');
  await p.query("CREATE TABLE IF NOT EXISTS reimbursements (id TEXT PRIMARY KEY, house_id TEXT, member_id TEXT, amount REAL, category TEXT, description TEXT, notes TEXT, receipt TEXT, status TEXT DEFAULT 'submitted', treasurer_note TEXT, payment_proof TEXT, created_at BIGINT, updated_at BIGINT)");
  console.log('All tables created');
  await p.end();
}
go().catch(e => { console.log('Error:', e.message); p.end(); });
