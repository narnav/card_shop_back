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
    { id: 'seller1', email: 'seller1@kardz.com', fullName: 'Collector Corner', role: 'user' },
    { id: 'seller2', email: 'seller2@kardz.com', fullName: 'Sealed and Dealed', role: 'user' },
    { id: 'seller3', email: 'seller3@kardz.com', fullName: 'Vintage Finds', role: 'user' },
    { id: 'manager1', email: 'manager@kardz.com', fullName: 'Tournament Organizer', role: 'manager' },
];

const MOCK_PRODUCTS = [
  { id: '1', name: 'Holo Charizard Card', description: 'Rare holographic Charizard card from the base set. Graded PSA 9.', price: 1200, imageUrls: ['https://picsum.photos/seed/charizard/600/400'], sellerId: 'seller1', category: 'Single Cards', condition: 'Used - Like New', rarity: 'Secret Rare', cardNumber: 'BS-004', createdAt: Date.now() - 100000, listingType: 'Fixed Price', amount: 1, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '2', name: 'First Edition Booster Box', description: 'Factory sealed booster box from the very first print run. A true collector\'s item.', price: 25000, imageUrls: ['https://picsum.photos/seed/boosterbox/600/400', 'https://picsum.photos/seed/boosterbox2/600/400'], sellerId: 'seller2', category: 'Closed Products', condition: 'New', rarity: 'Starlight Rare', createdAt: Date.now() - 200000, listingType: 'Fixed Price', amount: 3, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '3', name: 'Premium Card Sleeves (100-pack)', description: 'Protect your valuable cards with these durable, acid-free sleeves.', price: 15, imageUrls: ['https://picsum.photos/seed/sleeves1/600/400'], sellerId: 'seller1', category: 'Included Accessories', condition: 'New', rarity: 'Common', createdAt: Date.now() - 300000, listingType: 'Fixed Price', amount: 50, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '4', name: 'Vintage 1999 Full Card Set', description: 'Complete collection of all 151 original cards. All in near-mint condition.', price: 0, imageUrls: ['https://picsum.photos/seed/fullset/600/400', 'https://picsum.photos/seed/fullset2/600/400', 'https://picsum.photos/seed/fullset3/600/400'], sellerId: 'seller3', category: 'Collection', condition: 'Used - Like New', rarity: 'Rare', createdAt: Date.now() - 400000, listingType: 'Auction', amount: 1, startingPrice: 3000, currentBid: 3000, auctionEndDate: Date.now() + (5 * 24 * 60 * 60 * 1000), isHidden: 0 }, // 5 day auction
  { id: '5', name: 'Latest Expansion Booster Pack', description: 'A single booster pack from the newest expansion set. Contains 10 cards.', price: 5, imageUrls: ['https://picsum.photos/seed/boosterpack/600/400'], sellerId: 'seller2', category: 'Booster Boxes/Single Boosters', condition: 'New', rarity: 'Super Rare', createdAt: Date.now() - 500000, listingType: 'Fixed Price', amount: 100, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '6', name: 'Sealed Booster Box Case', description: 'A full, factory-sealed case containing 6 booster boxes of the latest set.', price: 650, imageUrls: ['https://picsum.photos/seed/case/600/400'], sellerId: 'seller1', category: 'Cases', condition: 'New', rarity: 'Ultra Rare', createdAt: Date.now() - 600000, listingType: 'Fixed Price', amount: 5, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '7', name: 'Mint Condition Pikachu Card', description: 'Iconic Pikachu card, perfect for any collection. Ungraded.', price: 50, imageUrls: ['https://picsum.photos/seed/pikachu/600/400'], sellerId: 'seller3', category: 'Single Cards', condition: 'New', rarity: 'Rare', cardNumber: 'BS-025', createdAt: Date.now() - 700000, listingType: 'Fixed Price', amount: 10, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '8', name: 'Hard Shell Card Case', description: 'A durable, magnetic hard case for protecting your most valuable single cards.', price: 25, imageUrls: ['https://picsum.photos/seed/hardcase/600/400'], sellerId: 'seller2', category: 'Included Accessories', condition: 'New', rarity: 'Common', createdAt: Date.now() - 800000, listingType: 'Fixed Price', amount: 25, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 0 },
  { id: '9', name: 'Hidden Test Product', description: 'This product should not be visible to regular users.', price: 99, imageUrls: ['https://picsum.photos/seed/hidden/600/400'], sellerId: 'seller1', category: 'Single Cards', condition: 'New', rarity: 'Common', cardNumber: 'TEST-001', createdAt: Date.now() - 900000, listingType: 'Fixed Price', amount: 1, startingPrice: null, currentBid: null, auctionEndDate: null, isHidden: 1 },
];

const MOCK_EVENTS = [
    { id: 'evt1', title: 'Weekly Local Tournament', description: 'Join us for our weekly friendly tournament. All skill levels welcome! Prizes for the top 4 players.', date: Date.now() + 7 * 24 * 60 * 60 * 1000, location: 'Kardz HQ, Main Hall', imageUrl: 'https://picsum.photos/seed/tournament1/800/400', organizerId: 'manager1', entryFee: 5, maxParticipants: 32 },
    { id: 'evt2', title: 'Regional Championship Qualifier', description: 'Compete for a spot in the regionals! This is a highly competitive event, so bring your best deck. Decklists are required upon entry.', date: Date.now() + 30 * 24 * 60 * 60 * 1000, location: 'Convention Center, Downtown', imageUrl: 'https://picsum.photos/seed/tournament2/800/400', organizerId: 'manager1', entryFee: 25, maxParticipants: 128 },
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
            amount INTEGER NOT NULL DEFAULT 1,
            imageUrl1 TEXT,
            imageUrl2 TEXT,
            imageUrl3 TEXT,
            sellerId TEXT NOT NULL,
            category TEXT NOT NULL,
            condition TEXT NOT NULL,
            rarity TEXT NOT NULL,
            cardNumber TEXT,
            createdAt INTEGER NOT NULL,
            listingType TEXT NOT NULL DEFAULT 'Fixed Price',
            startingPrice REAL,
            currentBid REAL,
            auctionEndDate INTEGER,
            isHidden INTEGER NOT NULL DEFAULT 0
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
            cardNumber TEXT,
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

        CREATE TABLE events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            date INTEGER NOT NULL,
            location TEXT,
            imageUrl TEXT,
            organizerId TEXT NOT NULL,
            entryFee REAL NOT NULL DEFAULT 0,
            maxParticipants INTEGER,
            FOREIGN KEY(organizerId) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE event_participants (
            eventId TEXT NOT NULL,
            userId TEXT NOT NULL,
            registeredAt INTEGER NOT NULL,
            PRIMARY KEY (eventId, userId),
            FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
        );
    `);
    console.log('Schema created.');

    // Seed initial data
    const userStmt = await db.prepare('INSERT INTO users (id, email, role, fullName) VALUES (?, ?, ?, ?)');
    for (const user of MOCK_USERS) {
        await userStmt.run(user.id, user.email, user.role, user.fullName);
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
    
    stmt = await db.prepare('INSERT INTO products (id, name, description, price, amount, imageUrl1, imageUrl2, imageUrl3, sellerId, category, condition, rarity, cardNumber, createdAt, listingType, startingPrice, currentBid, auctionEndDate, isHidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const p of MOCK_PRODUCTS) {
        const [img1, img2, img3] = p.imageUrls;
        await stmt.run(p.id, p.name, p.description, p.price, p.amount, img1 || null, img2 || null, img3 || null, p.sellerId, p.category, p.condition, p.rarity, p.cardNumber, p.createdAt, p.listingType, p.startingPrice, p.currentBid, p.auctionEndDate, p.isHidden);
    }
    await stmt.finalize();
    console.log('Seeded products');

    const eventStmt = await db.prepare('INSERT INTO events (id, title, description, date, location, imageUrl, organizerId, entryFee, maxParticipants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const evt of MOCK_EVENTS) {
        await eventStmt.run(evt.id, evt.title, evt.description, evt.date, evt.location, evt.imageUrl, evt.organizerId, evt.entryFee, evt.maxParticipants);
    }
    await eventStmt.finalize();
    console.log('Seeded mock events');
}

async function initializeDatabase() {
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.exec('PRAGMA foreign_keys = ON;');
    console.log('Connected to the SQLite database.');

    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='products' AND (SELECT COUNT(*) FROM pragma_table_info('products') WHERE name='amount') > 0");

    if (!tableExists) {
        console.log('Database not fully initialized or schema is outdated. Wiping and re-creating schema and data...');
        
        await db.exec('DROP TABLE IF EXISTS event_participants');
        await db.exec('DROP TABLE IF EXISTS events');
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