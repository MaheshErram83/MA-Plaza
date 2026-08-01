const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_9jnwWEGoOvi6@ep-bitter-brook-ayuu174y.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});
async function go() {
  await p.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS image TEXT").catch(() => {});
  await p.query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type TEXT DEFAULT 'text'").catch(() => {});
  console.log('Chat columns added');
  await p.end();
}
go().catch(e => { console.log('Error:', e.message); p.end(); });
