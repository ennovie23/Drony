// One-time cleanup: deletes fire/smoke rows (FrameAssessment) older than KEEP_MINUTES,
// then compacts the table so Neon gets the space back. Run from backend/:
//   node --env-file=.env scripts/cleanupDetections.js
// Rows are deleted permanently.
import pg from 'pg';

const KEEP_MINUTES = Number(process.argv[2] ?? 10);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

const size = async () => (await client.query(
  `select pg_size_pretty(pg_total_relation_size('"FrameAssessment"')) as size, (select count(*)::int from "FrameAssessment") as rows`,
)).rows[0];

console.log('Before:', await size());
const { rowCount } = await client.query(
  `delete from "FrameAssessment" where "createdAt" < (now() at time zone 'utc') - make_interval(mins => $1)`,
  [KEEP_MINUTES],
);
console.log(`Deleted ${rowCount} rows older than ${KEEP_MINUTES} minutes`);
await client.query('vacuum full "FrameAssessment"');
console.log('After: ', await size());
await client.end();
