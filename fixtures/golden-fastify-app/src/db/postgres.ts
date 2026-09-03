import { Pool } from 'pg';
import { DATABASE_URL } from '../config/config.js';

export const postgres = new Pool({
  connectionString: DATABASE_URL,
});
