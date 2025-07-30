import { useState } from 'react';
import lumberjack from '../lib/lumberjack';

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

const products: Product[] = [
  { id: 1, name: 'Laptop', price: 999, category: 'Electronics' },
  { id: 2, name: 'Headphones', price: 199, category: 'Electronics' },
  { id: 3, name: 'Coffee Maker', price: 79, category: 'Appliances' },
  { id: 4, name: 'Running Shoes', price: 129, category: 'Sports' },
  { id: 5, name: 'Backpack', price: 59, category: 'Accessories' },
  { id: 6, name: 'Smart Watch', price: 299, category: 'Electronics' },
];

function Shop() {
  const [cart, setCart] = useState<Product[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const addToCart = (product: Product) => {
    setCart([...cart, product]);
    lumberjack.track('add_to_cart', {
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      category: product.category,
    });
  };

  const checkout = () => {
    if (cart.length === 0) {
      alert('Your cart is empty!');
      return;
    }

    const total = cart.reduce((sum, item) => sum + item.price, 0);
    
    lumberjack.track('checkout_initiated', {
      cart_size: cart.length,
      total_amount: total,
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
      })),
    });

    // Simulate checkout error randomly
    if (Math.random() > 0.5) {
      const error = new Error('Payment processing failed');
      lumberjack.captureError(error, {
        context: 'checkout',
        cart_size: cart.length,
        total_amount: total,
      });
      alert('Checkout failed! Error has been logged.');
    } else {
      alert(`Checkout successful! Total: $${total}`);
      setCart([]);
    }
  };

  const filteredProducts = filter === 'all' 
    ? products 
    : products.filter(p => p.category === filter);

  return (
    <div className="container">
      <div className="page-header">
        <h1>Shop</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span>Cart ({cart.length} items)</span>
          <button className="btn btn-success" onClick={checkout}>
            Checkout
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Filter by Category</h2>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button 
            className={`btn ${filter === 'all' ? '' : 'btn-secondary'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`btn ${filter === 'Electronics' ? '' : 'btn-secondary'}`}
            onClick={() => setFilter('Electronics')}
          >
            Electronics
          </button>
          <button 
            className={`btn ${filter === 'Appliances' ? '' : 'btn-secondary'}`}
            onClick={() => setFilter('Appliances')}
          >
            Appliances
          </button>
          <button 
            className={`btn ${filter === 'Sports' ? '' : 'btn-secondary'}`}
            onClick={() => setFilter('Sports')}
          >
            Sports
          </button>
          <button 
            className={`btn ${filter === 'Accessories' ? '' : 'btn-secondary'}`}
            onClick={() => setFilter('Accessories')}
          >
            Accessories
          </button>
        </div>
      </div>

      <div className="demo-section">
        {filteredProducts.map(product => (
          <div key={product.id} className="card">
            <h3>{product.name}</h3>
            <p style={{ color: '#666', marginBottom: '10px' }}>{product.category}</p>
            <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
              ${product.price}
            </p>
            <button className="btn" onClick={() => addToCart(product)}>
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Shop;