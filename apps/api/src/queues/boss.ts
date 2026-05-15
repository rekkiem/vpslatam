import PgBoss from 'pg-boss'
import { config } from '../config'

export const boss = new PgBoss({
  connectionString: config.DATABASE_URL,
  retryLimit: 3,
  retryDelay: 30,      // seconds between retries
  retryBackoff: true,
  expireInHours: 24,
  deleteAfterDays: 7,
  monitorStateIntervalSeconds: 30,
  schema: 'pgboss',
})

boss.on('error', (err) => {
  console.error('[pg-boss]', err)
})
