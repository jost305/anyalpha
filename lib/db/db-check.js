import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres.sjbwnqpmiaibpraxlxtn:QjXqc3OFu5D5KcoV@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=no-verify' });

async function main() {
  await client.connect();
  const tokens = await client.query('SELECT * FROM launchpad_tokens');
  console.log('Tokens:', tokens.rows);
  const trades = await client.query('SELECT * FROM launchpad_trades');
  console.log('Trades:', trades.rows);
  process.exit(0);
}
main();
