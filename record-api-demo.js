// Demo of the new record-based register API
import { TreebeardCore, register, log } from './packages/core/dist/index.js';

// Initialize TreebeardCore
const core = TreebeardCore.init({
  apiKey: 'demo-key',
  projectName: 'record-api-demo',
  batchSize: 1,
  debug: true
});

// Mock fetch to see what would be sent
global.fetch = (url, options) => {
  console.log('\n=== REGISTER API CALL ===');
  console.log('URL:', url);
  
  const body = JSON.parse(options.body);
  console.log('Object registered:', JSON.stringify(body.objects[0], null, 2));
  console.log('========================\n');
  
  return Promise.resolve({ ok: true });
};

console.log('=== Record-Based Register API Demo ===\n');

// Example 1: Traditional single object registration (unchanged)
console.log('1. Single object registration (traditional):');
register({
  id: 'user-123',
  name: 'john',
  email: 'john@example.com',
  age: 30
});

// Example 2: NEW! Record-based registration - key becomes name
console.log('2. Record-based registration - keys become names:');
const user = { id: 'user-456', email: 'jane@example.com', age: 25 };
const product = { id: 'product-789', title: 'Laptop', price: 999.99 };

register({ user, product });

// Example 3: Mixed usage - some with explicit names, some without
console.log('3. Mixed usage:');
const order = { id: 'order-100', total: 1299.99, status: 'pending' };
const customer = { id: 'customer-200', name: 'explicit-name', email: 'customer@test.com' };

register({ order, customer });
// Note: 'customer' key will override the explicit 'name' field

// Example 4: Class instances still work the same way
console.log('4. Class instances (unchanged behavior):');
class Invoice {
  constructor(id, amount) {
    this.id = id;
    this.amount = amount;
    this.createdAt = new Date();
  }
}

const invoice = new Invoice('invoice-300', 599.99);
register(invoice); // Still uses class name 'invoice'

// Example 5: Show how context is updated with registered objects
console.log('5. Context integration:');
const sessionUser = { id: 'session-user-400', role: 'admin' };
register({ user: sessionUser });

// The context now has user_id = 'session-user-400'
log.info('Admin performed action', { action: 'delete', resourceId: 'resource-123' });

// Example 6: Complex nested example
console.log('6. Complex example with multiple related objects:');
const blogPost = { 
  id: 'post-500', 
  title: 'Great Article', 
  publishedAt: new Date(),
  wordCount: 1500
};

const author = { 
  id: 'author-600', 
  username: 'writer123',
  verified: true 
};

const category = { 
  id: 'category-700', 
  slug: 'technology',
  featured: false 
};

register({ 
  post: blogPost, 
  author, 
  category 
});

console.log('Demo complete! Notice how the record keys became object names.');

// Cleanup
await core.shutdown();