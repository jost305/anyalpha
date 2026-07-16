import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres.sjbwnqpmiaibpraxlxtn:QjXqc3OFu5D5KcoV@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=no-verify' });
client.connect().then(() => {
  return client.query("UPDATE launchpad_tokens SET dev_address = '0x13D7897E6E238595e56e27fBF40a16Aa011339a7' WHERE dev_address = '0x0000000000000000000000000000000000000000'");
}).then(res => {
  console.log('Updated', res.rowCount);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
