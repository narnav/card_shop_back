// npm install sqlite sqlite3

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function initializeDatabase() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');
    
    console.log('Connected to the SQLite database.');
    return db;
}

export { initializeDatabase };