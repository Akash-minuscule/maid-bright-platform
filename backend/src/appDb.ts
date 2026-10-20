import { config } from './config.js';
import { CustomerStore } from './customerStore.js';
import { openDatabase } from './db.js';

/** The one SQLite connection this server uses. */
export const db = openDatabase(config.dbPath);
export const customers = new CustomerStore(db);
