// To run this server, you need to install its dependencies:
// npm install express sqlite sqlite3 cors

import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const ADMIN_EMAIL = 'admin@kardz.com';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase payload size limit for base64 images

let db;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'database.db');

// --- Helper function to process product from DB ---
const processDbProduct = (product) => {
    if (!product) return null;
    const { imageUrl1, imageUrl2, imageUrl3, ...rest } = product;
    return {
        ...rest,
        imageUrls: [imageUrl1, imageUrl2, imageUrl3].filter(Boolean), // Filter out null/empty URLs
        isHidden: product.isHidden === 1
    };
};


// --- Middleware for Auth Checks ---
const isAuthenticated = async (req, res, next) => {
    const { user } = req.body;
    if (!user || !user.id) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    const dbUser = await db.get('SELECT id FROM users WHERE id = ?', user.id);
    if (!dbUser) {
        return res.status(401).json({ message: 'User not found.'});
    }
    req.dbUser = dbUser;
    next();
};

const isAdmin = async (req, res, next) => {
    const { user } = req.body;
    if (!user || !user.id) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    try {
        const dbUser = await db.get('SELECT role FROM users WHERE id = ?', user.id);
        if (dbUser && dbUser.role === 'admin') {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: Admin access required.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error during authorization', error: err.message });
    }
};

const isManager = async (req, res, next) => {
    const { user } = req.body;
    if (!user || !user.id) return res.status(401).json({ message: 'Authentication required.' });
    try {
        const dbUser = await db.get('SELECT role FROM users WHERE id = ?', user.id);
        if (dbUser && (dbUser.role === 'admin' || dbUser.role === 'manager')) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: Manager or Admin access required.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error during authorization', error: err.message });
    }
};

const canManageProduct = async (req, res, next) => {
    const { user } = req.body;
    const { id: productId } = req.params;

    if (!user || !user.id) {
        return res.status(401).json({ message: 'Authentication required.' });
    }
    try {
        const product = await db.get('SELECT sellerId FROM products WHERE id = ?', productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found.' });
        }
        
        const dbUser = await db.get('SELECT role FROM users WHERE id = ?', user.id);
        if (!dbUser) {
             return res.status(401).json({ message: 'User not found.' });
        }

        if (dbUser.role === 'admin' || product.sellerId === user.id) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: You do not have permission to manage this product.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error during authorization', error: err.message });
    }
};

const canManageEvent = async (req, res, next) => {
    const { user } = req.body;
    const { eventId } = req.params;
    if (!user || !user.id) return res.status(401).json({ message: 'Authentication required.' });
    try {
        const event = await db.get('SELECT organizerId FROM events WHERE id = ?', eventId);
        if (!event) return res.status(404).json({ message: 'Event not found.' });
        
        const dbUser = await db.get('SELECT role FROM users WHERE id = ?', user.id);
        if (!dbUser) return res.status(401).json({ message: 'User not found.' });

        if (dbUser.role === 'admin' || event.organizerId === user.id) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: You do not have permission to manage this event.' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Server error during event authorization', error: err.message });
    }
};

// --- Logger Middleware ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

const PORT = process.env.PORT || 3001;

// --- API ENDPOINTS ---

// GET Server Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// GET Initial App Data
app.get('/api/data', async (req, res) => {
    try {
        const productsFromDb = await db.all('SELECT * FROM products WHERE isHidden = 0 ORDER BY createdAt DESC');
        const products = productsFromDb.map(processDbProduct);
        const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
        const eventsFromDb = await db.all(`
            SELECT e.*, u.fullName as organizerName 
            FROM events e 
            JOIN users u ON e.organizerId = u.id 
            WHERE e.date >= ? ORDER BY e.date ASC
        `, Date.now());

        const events = await Promise.all(eventsFromDb.map(async (event) => {
            const participants = await db.all('SELECT p.userId, u.email as userEmail FROM event_participants p JOIN users u ON u.id = p.userId WHERE p.eventId = ?', event.id);
            return { ...event, participants };
        }));

        res.json({ products, categories, events });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch initial data', error: err.message });
    }
});

// GET Single Product with Bids
app.get('/api/product/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
        const productFromDb = await db.get('SELECT * FROM products WHERE id = ?', productId);
        if (!productFromDb) {
            return res.status(404).json({ message: 'Product not found' });
        }
        const product = processDbProduct(productFromDb);
        if (product.listingType === 'Auction') {
            product.bids = await db.all('SELECT * FROM bids WHERE productId = ? ORDER BY createdAt DESC', productId);
        }
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch product details', error: err.message });
    }
});

// POST Login / Register
app.post('/api/login', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }
    try {
        let user = await db.get('SELECT * FROM users WHERE email = ?', email);
        const isNewUser = !user;
        const role = email === ADMIN_EMAIL ? 'admin' : (user?.role || 'user');
        
        if (isNewUser) {
            const newUserId = `user_${Date.now()}`;
            await db.run('INSERT INTO users (id, email, role) VALUES (?, ?, ?)', newUserId, email, role);
            user = await db.get('SELECT * FROM users WHERE id = ?', newUserId);
        } else if (email === ADMIN_EMAIL && user.role !== 'admin') {
            await db.run('UPDATE users SET role = ? WHERE id = ?', 'admin', user.id);
            user.role = 'admin';
        }
        
        console.log(`Login attempt for email: "${email}", Role assigned: "${user.role}"`);

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error during login', error: err.message });
    }
});

// PUT Update User Profile
app.put('/api/user/profile', isAuthenticated, async (req, res) => {
    const { fullName, address, telephone, imageUrl, bitQrUrl, user } = req.body;
    try {
        await db.run(
            'UPDATE users SET fullName = ?, address = ?, telephone = ?, imageUrl = ?, bitQrUrl = ? WHERE id = ?',
            fullName, address, telephone, imageUrl, bitQrUrl, user.id
        );
        const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', user.id);
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update profile', error: err.message });
    }
});

// POST Add Product
app.post('/api/products', isAuthenticated, async (req, res) => {
    const { listingType, name, description, price, amount, startingPrice, auctionEndDate, imageUrls, category, condition, rarity, cardNumber, sellerId } = req.body;
    try {
        const id = `prod_${Date.now()}`;
        const createdAt = Date.now();
        const currentBid = listingType === 'Auction' ? startingPrice : null;
        
        const [imageUrl1, imageUrl2, imageUrl3] = imageUrls.map(url => url || null);

        await db.run(
            'INSERT INTO products (id, name, description, price, amount, imageUrl1, imageUrl2, imageUrl3, category, condition, rarity, cardNumber, sellerId, createdAt, listingType, startingPrice, currentBid, auctionEndDate, isHidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
            id, name, description, price, amount, imageUrl1, imageUrl2, imageUrl3, category, condition, rarity, cardNumber, sellerId, createdAt, listingType, startingPrice, currentBid, auctionEndDate
        );
        const newProductFromDb = await db.get('SELECT * FROM products WHERE id = ?', id);
        const newProduct = processDbProduct(newProductFromDb);
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(500).json({ message: 'Failed to add product', error: err.message });
    }
});

// PUT Update Product (Admin or Seller)
app.put('/api/products/:id', canManageProduct, async (req, res) => {
    const { id } = req.params;
    const { name, description, price, amount, startingPrice, auctionEndDate, imageUrls, category, condition, listingType, rarity, cardNumber } = req.body;
    
    try {
        const product = await db.get('SELECT currentBid FROM products WHERE id = ?', id);
        const currentBid = listingType === 'Auction' ? (product.currentBid || startingPrice) : null;
        const [imageUrl1, imageUrl2, imageUrl3] = [...imageUrls, null, null, null];

        await db.run(
            'UPDATE products SET name = ?, description = ?, price = ?, amount = ?, startingPrice = ?, auctionEndDate = ?, imageUrl1 = ?, imageUrl2 = ?, imageUrl3 = ?, category = ?, condition = ?, listingType = ?, currentBid = ?, rarity = ?, cardNumber = ? WHERE id = ?',
            name, description, price, amount, startingPrice, auctionEndDate, imageUrl1, imageUrl2, imageUrl3, category, condition, listingType, currentBid, rarity, cardNumber, id
        );
        
        const updatedProductFromDb = await db.get('SELECT * FROM products WHERE id = ?', id);
        res.json(processDbProduct(updatedProductFromDb));
    } catch (err) {
        res.status(500).json({ message: 'Failed to update product', error: err.message });
    }
});

// DELETE Product (Admin or Seller)
app.delete('/api/products/:id', canManageProduct, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.run('DELETE FROM products WHERE id = ?', id);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
});

// PATCH Toggle Product Visibility (Admin or Seller)
app.patch('/api/products/:id/toggle-visibility', canManageProduct, async (req, res) => {
    const { id } = req.params;
    try {
        await db.run('UPDATE products SET isHidden = 1 - isHidden WHERE id = ?', id);
        const updatedProductFromDb = await db.get('SELECT * FROM products WHERE id = ?', id);
        if (!updatedProductFromDb) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(processDbProduct(updatedProductFromDb));
    } catch (err) {
        res.status(500).json({ message: 'Failed to toggle product visibility', error: err.message });
    }
});

// GET all products for Admin
app.post('/api/admin/products', isAdmin, async (req, res) => {
    try {
        const productsFromDb = await db.all('SELECT * FROM products ORDER BY createdAt DESC');
        res.json(productsFromDb.map(processDbProduct));
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch admin products', error: err.message });
    }
});

// GET all products for a specific seller
app.post('/api/my-products', isAuthenticated, async (req, res) => {
    const { user } = req.body;
    try {
        const productsFromDb = await db.all('SELECT * FROM products WHERE sellerId = ? ORDER BY createdAt DESC', user.id);
        res.json(productsFromDb.map(processDbProduct));
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch your products', error: err.message });
    }
});


// POST Place Bid
app.post('/api/products/:productId/bid', isAuthenticated, async (req, res) => {
    const { productId } = req.params;
    const { amount, user } = req.body;

    if (!amount || isNaN(parseFloat(amount))) return res.status(400).json({ message: 'Invalid bid amount.' });

    try {
        await db.exec('BEGIN TRANSACTION');

        const product = await db.get('SELECT * FROM products WHERE id = ?', productId);
        if (!product) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ message: 'Product not found.' });
        }
        if (product.listingType !== 'Auction') {
            await db.exec('ROLLBACK');
            return res.status(400).json({ message: 'This item is not an auction.' });
        }
        if (product.auctionEndDate && Date.now() > product.auctionEndDate) {
            await db.exec('ROLLBACK');
            return res.status(400).json({ message: 'This auction has already ended.' });
        }
        if (parseFloat(amount) <= product.currentBid) {
            await db.exec('ROLLBACK');
            return res.status(400).json({ message: `Your bid must be higher than the current bid of ₪${product.currentBid.toFixed(2)}.` });
        }
        if (product.sellerId === user.id) {
            await db.exec('ROLLBACK');
            return res.status(400).json({ message: "You cannot bid on your own item." });
        }

        const bidId = `bid_${Date.now()}`;
        const createdAt = Date.now();
        await db.run(
            'INSERT INTO bids (id, productId, userId, userEmail, amount, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
            bidId, productId, user.id, user.email, amount, createdAt
        );
        await db.run('UPDATE products SET currentBid = ? WHERE id = ?', amount, productId);

        await db.exec('COMMIT');
        
        const updatedProductFromDb = await db.get('SELECT * FROM products WHERE id = ?', productId);
        const updatedProduct = processDbProduct(updatedProductFromDb);
        updatedProduct.bids = await db.all('SELECT * FROM bids WHERE productId = ? ORDER BY createdAt DESC', productId);

        res.status(201).json(updatedProduct);

    } catch (err) {
        await db.exec('ROLLBACK');
        res.status(500).json({ message: 'Failed to place bid', error: err.message });
    }
});

// POST Add Category (Admin Only)
app.post('/api/categories', isAdmin, async (req, res) => {
    const { name, imageUrl } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required.' });
    const id = `cat_${Date.now()}`;
    try {
        await db.run('INSERT INTO categories (id, name, imageUrl) VALUES (?, ?, ?)', id, name, imageUrl);
        const newCategory = await db.get('SELECT * FROM categories WHERE id = ?', id);
        res.status(201).json(newCategory);
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ message: `Category "${name}" already exists.` });
        }
        res.status(500).json({ message: 'Failed to add category', error: err.message });
    }
});

// PUT Update Category (Admin Only)
app.put('/api/categories/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { newName, imageUrl } = req.body;
    if (!newName) return res.status(400).json({ message: 'New name is required.' });

    try {
        const oldCategory = await db.get('SELECT name FROM categories WHERE id = ?', id);
        if (!oldCategory) {
            return res.status(404).json({ message: 'Category not found.' });
        }

        await db.exec('BEGIN TRANSACTION');
        await db.run('UPDATE categories SET name = ?, imageUrl = ? WHERE id = ?', newName, imageUrl, id);
        await db.run('UPDATE products SET category = ? WHERE category = ?', newName, oldCategory.name);
        await db.exec('COMMIT');

        const productsFromDb = await db.all('SELECT * FROM products ORDER BY createdAt DESC');
        const products = productsFromDb.map(processDbProduct);
        const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
        res.json({ message: 'Category updated successfully', products, categories });

    } catch (err) {
        await db.exec('ROLLBACK');
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ message: `Category "${newName}" already exists.` });
        }
        res.status(500).json({ message: 'Failed to update category', error: err.message });
    }
});

// DELETE Category (Admin Only)
app.delete('/api/categories/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const category = await db.get('SELECT name FROM categories WHERE id = ?', id);
        if (!category) return res.status(404).json({ message: 'Category not found' });
        
        const productInUse = await db.get('SELECT 1 FROM products WHERE category = ? LIMIT 1', category.name);
        if (productInUse) {
            return res.status(400).json({ message: `Cannot delete category "${category.name}" as it is currently in use.`});
        }

        await db.run('DELETE FROM categories WHERE id = ?', id);
        res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete category', error: err.message });
    }
});

// POST Download Database Backup (Admin Only)
app.post('/api/database/backup', isAdmin, (req, res) => {
    try {
        res.download(dbPath, 'database-backup.db', (err) => {
            if (err) {
                console.error("Error sending database backup:", err);
                if (!res.headersSent) {
                    res.status(500).send({ message: "Could not download the file." });
                }
            }
        });
    } catch (err) {
        console.error("Error preparing database backup:", err);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Failed to prepare database backup', error: err.message });
        }
    }
});

// GET Orders for user
app.get('/api/orders/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const orders = await db.all('SELECT * FROM orders WHERE userId = ? ORDER BY date DESC', userId);
        for (const order of orders) {
            order.items = await getOrderItems(order.id);
        }
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
    }
});

// GET a single order by ID
app.get('/api/order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        const order = await db.get('SELECT * FROM orders WHERE id = ?', orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        order.items = await getOrderItems(order.id);
        
        if (order.items && order.items.length > 0) {
            const firstProductId = order.items[0].product.id;
            const product = await db.get('SELECT sellerId FROM products WHERE id = ?', firstProductId);
            if (product && product.sellerId) {
                const sellerInfo = await db.get('SELECT telephone, bitQrUrl FROM users WHERE id = ?', product.sellerId);
                if (sellerInfo) {
                    order.sellerInfo = sellerInfo;
                }
            }
        }
        
        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch order', error: err.message });
    }
});

// Helper to get items for an order
const getOrderItems = async (orderId) => {
    const itemsFromDb = await db.all(`
        SELECT oi.*, u.fullName as sellerName, u.email as sellerEmail
        FROM order_items oi
        LEFT JOIN users u ON u.id = oi.sellerId
        WHERE oi.orderId = ?
    `, orderId);
    return itemsFromDb.map(item => ({
        quantity: item.quantity,
        product: {
            id: item.productId,
            name: item.name,
            price: item.price,
            imageUrls: [item.imageUrl],
            sellerId: item.sellerId,
            sellerName: item.sellerName || item.sellerEmail,
            cardNumber: item.cardNumber,
            description: '',
            category: '',
            condition: 'New',
            rarity: 'Common',
            createdAt: 0,
            listingType: 'Fixed Price',
            startingPrice: 0,
            currentBid: 0,
            auctionEndDate: null,
            isHidden: false,
            amount: 0, // Not relevant for past orders
        }
    }));
};

// Helper function to create an order
const createOrder = async (orderData) => {
    const { userId, cart, total, paymentMethod, status } = orderData;
    const orderId = `order_${Date.now()}`;
    const date = Date.now();
    
    await db.exec('BEGIN TRANSACTION');
    try {
        // Stock check and update
        for (const item of cart) {
            const product = await db.get('SELECT amount, listingType FROM products WHERE id = ? FOR UPDATE', item.product.id);
            if (product.listingType !== 'Auction') { // Only check for non-auction items
                if (!product || product.amount < item.quantity) {
                    // This error will be caught and sent to client.
                    throw new Error(`Not enough stock for "${item.product.name}". Only ${product?.amount || 0} left.`);
                }
                const newAmount = product.amount - item.quantity;
                await db.run('UPDATE products SET amount = ? WHERE id = ?', newAmount, item.product.id);
            }
        }

        await db.run(
            'INSERT INTO orders (id, userId, total, date, paymentMethod, status) VALUES (?, ?, ?, ?, ?, ?)',
            orderId, userId, total, date, paymentMethod, status
        );

        const stmt = await db.prepare('INSERT INTO order_items (orderId, productId, sellerId, quantity, price, name, imageUrl, cardNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const item of cart) {
            await stmt.run(orderId, item.product.id, item.product.sellerId, item.quantity, item.product.price, item.product.name, item.product.imageUrls[0], item.product.cardNumber);
        }
        await stmt.finalize();

        await db.exec('COMMIT');
        
        const newOrder = await db.get('SELECT * FROM orders WHERE id = ?', orderId);
        newOrder.items = await getOrderItems(orderId);
        return newOrder;
    } catch(err) {
        await db.exec('ROLLBACK');
        throw err;
    }
};

// POST Checkout (Card)
app.post('/api/checkout', isAuthenticated, async (req, res) => {
    try {
        const newOrder = await createOrder({ ...req.body, paymentMethod: 'Card', status: 'Completed' });
        res.status(201).json(newOrder);
    } catch(err) {
        if (err.message.startsWith('Not enough stock')) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Failed to create order', error: err.message });
    }
});

// POST Bit Checkout
app.post('/api/bit-checkout', isAuthenticated, async (req, res) => {
    try {
        const newOrder = await createOrder({
            ...req.body,
            paymentMethod: 'Bit',
            status: 'Pending Payment',
        });
        res.status(201).json(newOrder);
    } catch(err) {
         if (err.message.startsWith('Not enough stock')) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Failed to create Bit order', error: err.message });
    }
});

// User Management Endpoints (Admin)
app.post('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await db.all('SELECT id, email, role, fullName FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch users', error: err.message });
    }
});

app.put('/api/admin/users/:userId/role', isAdmin, async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    if (!['admin', 'manager', 'user'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role specified.' });
    }
    const adminUser = await db.get('SELECT email FROM users WHERE id = ?', userId);
    if(adminUser && adminUser.email === ADMIN_EMAIL && role !== 'admin') {
        return res.status(403).json({ message: 'Cannot change the role of the primary admin account.'});
    }

    try {
        await db.run('UPDATE users SET role = ? WHERE id = ?', role, userId);
        const updatedUser = await db.get('SELECT id, email, role, fullName FROM users WHERE id = ?', userId);
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update user role', error: err.message });
    }
});

// Event Endpoints
const getFullEvent = async (eventId) => {
    const event = await db.get('SELECT e.*, u.fullName as organizerName FROM events e JOIN users u ON e.organizerId = u.id WHERE e.id = ?', eventId);
    if (!event) return null;
    event.participants = await db.all(`
        SELECT p.userId, u.email as userEmail, u.fullName as userName, p.registeredAt 
        FROM event_participants p 
        JOIN users u ON p.userId = u.id 
        WHERE p.eventId = ? 
        ORDER BY p.registeredAt ASC
    `, eventId);
    return event;
};

app.get('/api/events/:eventId', async (req, res) => {
    try {
        const event = await getFullEvent(req.params.eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });
        res.json(event);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch event', error: err.message });
    }
});

app.post('/api/events', isManager, async (req, res) => {
    const { title, description, date, location, imageUrl, entryFee, maxParticipants, user } = req.body;
    const id = `evt_${Date.now()}`;
    try {
        await db.run('INSERT INTO events (id, title, description, date, location, imageUrl, organizerId, entryFee, maxParticipants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            id, title, description, date, location, imageUrl, user.id, entryFee, maxParticipants || null);
        const newEvent = await getFullEvent(id);
        res.status(201).json(newEvent);
    } catch (err) {
        res.status(500).json({ message: 'Failed to create event', error: err.message });
    }
});

app.put('/api/events/:eventId', canManageEvent, async (req, res) => {
    const { eventId } = req.params;
    const { title, description, date, location, imageUrl, entryFee, maxParticipants } = req.body;
    try {
        await db.run('UPDATE events SET title = ?, description = ?, date = ?, location = ?, imageUrl = ?, entryFee = ?, maxParticipants = ? WHERE id = ?',
            title, description, date, location, imageUrl, entryFee, maxParticipants || null, eventId);
        const updatedEvent = await getFullEvent(eventId);
        res.json(updatedEvent);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update event', error: err.message });
    }
});

app.delete('/api/events/:eventId', canManageEvent, async (req, res) => {
    const { eventId } = req.params;
    try {
        await db.run('DELETE FROM events WHERE id = ?', eventId);
        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete event', error: err.message });
    }
});

app.post('/api/my-events', isManager, async (req, res) => {
    const { user } = req.body;
    try {
        const eventsFromDb = await db.all('SELECT * FROM events WHERE organizerId = ? ORDER BY date DESC', user.id);
        const events = await Promise.all(eventsFromDb.map(async (event) => {
            const participants = await db.all('SELECT userId FROM event_participants WHERE eventId = ?', event.id);
            return { ...event, participants };
        }));
        res.json(events);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch your events', error: err.message });
    }
});

app.post('/api/events/:eventId/register', isAuthenticated, async (req, res) => {
    const { eventId } = req.params;
    const { user } = req.body;
    try {
        await db.exec('BEGIN TRANSACTION');
        const event = await db.get('SELECT maxParticipants FROM events WHERE id = ?', eventId);
        if (!event) {
            await db.exec('ROLLBACK');
            return res.status(404).json({ message: 'Event not found.' });
        }
        if (event.maxParticipants) {
            const countResult = await db.get('SELECT COUNT(*) as count FROM event_participants WHERE eventId = ?', eventId);
            if (countResult.count >= event.maxParticipants) {
                await db.exec('ROLLBACK');
                return res.status(400).json({ message: 'Event is already full.' });
            }
        }
        await db.run('INSERT INTO event_participants (eventId, userId, registeredAt) VALUES (?, ?, ?)', eventId, user.id, Date.now());
        await db.exec('COMMIT');
        const updatedEvent = await getFullEvent(eventId);
        res.json(updatedEvent);
    } catch (err) {
        await db.exec('ROLLBACK');
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ message: 'You are already registered for this event.' });
        }
        res.status(500).json({ message: 'Failed to register for event', error: err.message });
    }
});

app.delete('/api/events/:eventId/register', isAuthenticated, async (req, res) => {
    const { eventId } = req.params;
    const { user } = req.body;
    try {
        await db.run('DELETE FROM event_participants WHERE eventId = ? AND userId = ?', eventId, user.id);
        const updatedEvent = await getFullEvent(eventId);
        res.json(updatedEvent);
    } catch (err) {
        res.status(500).json({ message: 'Failed to unregister from event', error: err.message });
    }
});


// Simulate Bit payment confirmation
const confirmPendingPayments = async () => {
    try {
        const pendingOrders = await db.all("SELECT id FROM orders WHERE status = 'Pending Payment' AND paymentMethod = 'Bit'");
        for (const order of pendingOrders) {
            // Randomly confirm payment to simulate reality
            if (Math.random() > 0.3) { 
                console.log(`Confirming payment for pending Bit order ${order.id}...`);
                await db.run("UPDATE orders SET status = 'Completed' WHERE id = ?", order.id);
            } else {
                console.log(`Payment for order ${order.id} still pending...`);
            }
        }
    } catch (err) {
        console.error("Error confirming pending payments:", err);
    }
};

async function startServer() {
    try {
        db = await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
            // Simulate payment confirmation for any pending orders after a delay
            setInterval(confirmPendingPayments, 15000); // Check every 15 seconds
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();