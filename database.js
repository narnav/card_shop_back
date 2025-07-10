// To run this server, you need to install its dependencies:
// npm install sqlite sqlite3

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.db');

const MOCK_USERS = [
    { id: 'seller1', email: 'seller1@kardz.com', fullName: 'Collector Corner' },
    { id: 'seller2', email: 'seller2@kardz.com', fullName: 'Sealed and Dealed' },
    { id: 'seller3', email: 'seller3@kardz.com', fullName: 'Vintage Finds' },
];

const MOCK_PRODUCTS = [
  { id: '1', name: 'Holo Charizard Card', description: 'Rare holographic Charizard card from the base set. Graded PSA 9.', price: 1200, imageUrls: ['https://picsum.photos/seed/charizard/600/400'], sellerId: 'seller1', category: 'Single Cards', condition: 'Used - Like New', createdAt: Date.now() - 100000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '2', name: 'First Edition Booster Box', description: 'Factory sealed booster box from the very first print run. A true collector\'s item.', price: 25000, imageUrls: ['https://picsum.photos/seed/boosterbox/600/400', 'https://picsum.photos/seed/boosterbox2/600/400'], sellerId: 'seller2', category: 'Closed Products', condition: 'New', createdAt: Date.now() - 200000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '3', name: 'Premium Card Sleeves (100-pack)', description: 'Protect your valuable cards with these durable, acid-free sleeves.', price: 15, imageUrls: ['https://picsum.photos/seed/sleeves1/600/400'], sellerId: 'seller1', category: 'Included Accessories', condition: 'New', createdAt: Date.now() - 300000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '4', name: 'Vintage 1999 Full Card Set', description: 'Complete collection of all 151 original cards. All in near-mint condition.', price: 0, imageUrls: ['https://picsum.photos/seed/fullset/600/400', 'https://picsum.photos/seed/fullset2/600/400', 'https://picsum.photos/seed/fullset3/600/400'], sellerId: 'seller3', category: 'Collection', condition: 'Used - Like New', createdAt: Date.now() - 400000, listingType: 'Auction', startingPrice: 3000, currentBid: 3000, auctionEndDate: Date.now() + (5 * 24 * 60 * 60 * 1000) }, // 5 day auction
  { id: '5', name: 'Latest Expansion Booster Pack', description: 'A single booster pack from the newest expansion set. Contains 10 cards.', price: 5, imageUrls: ['https://picsum.photos/seed/boosterpack/600/400'], sellerId: 'seller2', category: 'Booster Boxes/Single Boosters', condition: 'New', createdAt: Date.now() - 500000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '6', name: 'Sealed Booster Box Case', description: 'A full, factory-sealed case containing 6 booster boxes of the latest set.', price: 650, imageUrls: ['https://picsum.photos/seed/case/600/400'], sellerId: 'seller1', category: 'Cases', condition: 'New', createdAt: Date.now() - 600000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '7', name: 'Mint Condition Pikachu Card', description: 'Iconic Pikachu card, perfect for any collection. Ungraded.', price: 50, imageUrls: ['https://picsum.photos/seed/pikachu/600/400'], sellerId: 'seller3', category: 'Single Cards', condition: 'New', createdAt: Date.now() - 700000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '8', name: 'Hard Shell Card Case', description: 'A durable, magnetic hard case for protecting your most valuable single cards.', price: 25, imageUrls: ['https://picsum.photos/seed/hardcase/600/400'], sellerId: 'seller2', category: 'Included Accessories', condition: 'New', createdAt: Date.now() - 800000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
];

const setupDatabase = async (db) => {
    await db.exec(`
        PRAGMA foreign_keys = ON;

        CREATE TABLE categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            imageUrl TEXT
        );

        CREATE TABLE products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            imageUrl1 TEXT,
            imageUrl2 TEXT,
            imageUrl3 TEXT,
            sellerId TEXT NOT NULL,
            category TEXT NOT NULL,
            condition TEXT NOT NULL,
            createdAt INTEGER NOT NULL,
            listingType TEXT NOT NULL DEFAULT 'Fixed Price',
            startingPrice REAL,
            currentBid REAL,
            auctionEndDate INTEGER
        );

        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            role TEXT NOT NULL DEFAULT 'user',
            fullName TEXT,
            address TEXT,
            telephone TEXT,
            imageUrl TEXT,
            bitQrUrl TEXT
        );

        CREATE TABLE orders (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            total REAL NOT NULL,
            date INTEGER NOT NULL,
            paymentMethod TEXT NOT NULL DEFAULT 'Card',
            status TEXT NOT NULL DEFAULT 'Completed',
            FOREIGN KEY(userId) REFERENCES users(id)
        );

        CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId TEXT NOT NULL,
            productId TEXT NOT NULL,
            sellerId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            name TEXT NOT NULL,
            imageUrl TEXT,
            FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY(productId) REFERENCES products(id),
            FOREIGN KEY(sellerId) REFERENCES users(id)
        );

        CREATE TABLE bids (
            id TEXT PRIMARY KEY,
            productId TEXT NOT NULL,
            userId TEXT NOT NULL,
            userEmail TEXT NOT NULL,
            amount REAL NOT NULL,
            createdAt INTEGER NOT NULL,
            FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY(userId) REFERENCES users(id)
        );
    `);
    console.log('Schema created.');

    // Seed initial data
    const userStmt = await db.prepare('INSERT INTO users (id, email, role, fullName) VALUES (?, ?, ?, ?)');
    for (const user of MOCK_USERS) {
        await userStmt.run(user.id, user.email, 'user', user.fullName);
    }
    await userStmt.finalize();
    console.log('Seeded mock users');

    const categories = [
        { id: 'cat1', name: 'Collection', imageUrl: 'https://picsum.photos/seed/collection/400/400' },
        { id: 'cat2', name: 'Single Cards', imageUrl: 'https://picsum.photos/seed/singlecard/400/400' },
        { id: 'cat3', name: 'Included Accessories', imageUrl: 'https://picsum.photos/seed/accessories/400/400' },
        { id: 'cat4', name: 'Closed Products', imageUrl: 'https://picsum.photos/seed/closedprod/400/400' },
        { id: 'cat5', name: 'Booster Boxes/Single Boosters', imageUrl: 'https://picsum.photos/seed/boosters/400/400' },
        { id: 'cat6', name: 'Cases', imageUrl: 'https://picsum.photos/seed/cases/400/400' },
    ];
    let stmt = await db.prepare('INSERT INTO categories (id, name, imageUrl) VALUES (?, ?, ?)');
    for (const cat of categories) {
        await stmt.run(cat.id, cat.name, cat.imageUrl);
    }
    await stmt.finalize();
    console.log('Seeded categories');
    
    stmt = await db.prepare('INSERT INTO products (id, name, description, price, imageUrl1, imageUrl2, imageUrl3, sellerId, category, condition, createdAt, listingType, startingPrice, currentBid, auctionEndDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of MOCK_PRODUCTS) {
        const [img1, img2, img3] = p.imageUrls;
        await stmt.run(p.id, p.name, p.description, p.price, img1 || null, img2 || null, img3 || null, p.sellerId, p.category, p.condition, p.createdAt, p.listingType, p.startingPrice, p.currentBid, p.auctionEndDate);
    }
    await stmt.finalize();
    console.log('Seeded products');
}

async function initializeDatabase() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');
    console.log('Connected to the SQLite database.');

    // Check if the last table to be created ('bids') exists.
    // This is more robust than checking for just the first table. If it's missing,
    // we assume the database is in an incomplete state and rebuild it.
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='bids'");

    if (!tableExists) {
        console.log('Database not fully initialized. Wiping and re-creating schema and data...');
        
        // Drop tables in reverse order of creation to respect foreign keys, just in case of partial state
        await db.exec('DROP TABLE IF EXISTS bids');
        await db.exec('DROP TABLE IF EXISTS order_items');
        await db.exec('DROP TABLE IF EXISTS orders');
        await db.exec('DROP TABLE IF EXISTS users');
        await db.exec('DROP TABLE IF EXISTS products');
        await db.exec('DROP TABLE IF EXISTS categories');

        try {
            await db.exec('BEGIN TRANSACTION');
            await setupDatabase(db);
            await db.exec('COMMIT');
            console.log('Database successfully initialized.');
        } catch (err) {
            await db.exec('ROLLBACK');
            console.error('Failed to initialize database:', err);
            throw err; // Propagate the error to stop the server from starting.
        }
    } else {
        console.log('Database already initialized.');
    }
    
    return db;
}

export { initializeDatabase };