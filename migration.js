// To run this script, use: npm run migrate
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

console.log("Starting database migration script...");

const MOCK_PRODUCTS = [
  { id: '1', name: 'High-Performance Laptop', description: 'A powerful laptop for all your needs.', price: 1200, imageUrls: ['https://picsum.photos/seed/laptop1/600/400', 'https://picsum.photos/seed/laptop2/600/400', 'https://picsum.photos/seed/laptop3/600/400'], sellerId: 'seller1', category: 'Electronics', condition: 'New', createdAt: Date.now() - 100000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '2', name: 'Stylish Running Shoes', description: 'Comfortable and stylish shoes for your daily run.', price: 150, imageUrls: ['https://picsum.photos/seed/shoes1/600/400'], sellerId: 'seller2', category: 'Fashion', condition: 'New', createdAt: Date.now() - 200000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '3', name: 'Modern Bookshelf', description: 'A sleek bookshelf to organize your collection.', price: 250, imageUrls: ['https://picsum.photos/seed/bookshelf1/600/400', 'https://picsum.photos/seed/bookshelf2/600/400'], sellerId: 'seller1', category: 'Home & Garden', condition: 'Used - Like New', createdAt: Date.now() - 300000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '4', name: 'Professional Tennis Racket', description: 'Dominate the court with this professional-grade racket.', price: 220, imageUrls: ['https://picsum.photos/seed/racket1/600/400'], sellerId: 'seller3', category: 'Sports & Outdoors', condition: 'Used - Like New', createdAt: Date.now() - 400000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '5', name: 'The Great Gatsby', description: 'A classic novel by F. Scott Fitzgerald.', price: 15, imageUrls: ['https://picsum.photos/seed/book1/600/400'], sellerId: 'seller2', category: 'Books', condition: 'New', createdAt: Date.now() - 500000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '6', name: 'Smart VR Headset', description: 'Immerse yourself in virtual reality with this next-gen headset.', price: 0, imageUrls: ['https://picsum.photos/seed/vr1/600/400', 'https://picsum.photos/seed/vr2/600/400', 'https://picsum.photos/seed/vr3/600/400'], sellerId: 'seller1', category: 'Electronics', condition: 'Refurbished', createdAt: Date.now() - 600000, listingType: 'Auction', startingPrice: 300, currentBid: 300, auctionEndDate: Date.now() + (3 * 24 * 60 * 60 * 1000) }, // 3 day auction
  { id: '7', name: 'Designer Leather Jacket', description: 'A timeless leather jacket for a cool look.', price: 750, imageUrls: ['https://picsum.photos/seed/jacket1/600/400'], sellerId: 'seller3', category: 'Fashion', condition: 'New', createdAt: Date.now() - 700000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
  { id: '8', name: 'Ergonomic Office Chair', description: 'Stay comfortable during long work hours.', price: 350, imageUrls: ['https://picsum.photos/seed/chair1/600/400', 'https://picsum.photos/seed/chair2/600/400'], sellerId: 'seller2', category: 'Home & Garden', condition: 'Used - Like New', createdAt: Date.now() - 800000, listingType: 'Fixed Price', startingPrice: null, currentBid: null, auctionEndDate: null },
];

const MIGRATIONS = [
    {
        name: '001-initial-schema-and-seed',
        up: async (db) => {
            await db.exec(`
                PRAGMA foreign_keys = ON;

                CREATE TABLE categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE
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
                    role TEXT NOT NULL DEFAULT 'user'
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
                    quantity INTEGER NOT NULL,
                    price REAL NOT NULL,
                    name TEXT NOT NULL,
                    imageUrl TEXT,
                    FOREIGN KEY(orderId) REFERENCES orders(id) ON DELETE CASCADE,
                    FOREIGN KEY(productId) REFERENCES products(id)
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
            const categories = [
                { id: 'cat1', name: 'Electronics' },
                { id: 'cat2', name: 'Fashion' },
                { id: 'cat3', name: 'Home & Garden' },
                { id: 'cat4', name: 'Sports & Outdoors' },
                { id: 'cat5', name: 'Books' },
                { id: 'cat6', name: 'Toys & Games' },
            ];
            let stmt = await db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)');
            for (const cat of categories) {
                await stmt.run(cat.id, cat.name);
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
    },
];

async function migrate() {
    let db;
    try {
        db = await open({
            filename: './database.db',
            driver: sqlite3.Database
        });

        console.log('Connected to the SQLite database.');

        await db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                applied_at INTEGER NOT NULL
            );
        `);
        console.log('Migrations table verified.');

        const appliedMigrations = await db.all('SELECT name FROM migrations ORDER BY name');
        const appliedMigrationNames = appliedMigrations.map(m => m.name);

        console.log('Applied migrations:', appliedMigrationNames.length > 0 ? appliedMigrationNames.join(', ') : 'None');

        for (const migration of MIGRATIONS) {
            if (!appliedMigrationNames.includes(migration.name)) {
                console.log(`Applying migration: ${migration.name}...`);
                await db.exec('BEGIN TRANSACTION');
                try {
                    if (typeof migration.up === 'function') {
                        await migration.up(db);
                    } else {
                        await db.exec(migration.up);
                    }
                    await db.run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', migration.name, Date.now());
                    await db.exec('COMMIT');
                    console.log(`Successfully applied migration: ${migration.name}`);
                } catch (err) {
                    console.error(`Failed to apply migration ${migration.name}:`, err);
                    await db.exec('ROLLBACK');
                    throw err; 
                }
            }
        }

        console.log('All migrations have been successfully applied.');
    } catch (err) {
        console.error('An error occurred during migration:', err.message);
        process.exit(1);
    } finally {
        if (db) {
            await db.close();
            console.log('Database connection closed.');
        }
    }
}

migrate();