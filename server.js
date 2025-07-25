require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${JSON.stringify(req.body)}`);
  next();
});

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'YeetFit Backend is running' });
});

// Test Razorpay credentials
app.get('/api/test-razorpay', async (req, res) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Missing Razorpay credentials');
      return res.status(500).json({ error: 'Missing Razorpay credentials' });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const orders = await razorpay.orders.all({ count: 1 });
    console.log('Razorpay test response:', orders);
    res.json({ status: 'success', message: 'Razorpay credentials valid', orders });
  } catch (error) {
    console.error('Razorpay test error:', {
      message: error.message,
      status: error.status,
      code: error.error?.code,
      description: error.error?.description,
      source: error.error?.source,
      step: error.error?.step,
      reason: error.error?.reason,
    });
    res.status(500).json({
      error: 'Failed to test Razorpay credentials',
      details: error.message,
      razorpayError: error.error,
    });
  }
});

// Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency, userId, name, email = '', contact = '' } = req.body;
    console.log('Create order request:', { amount, currency, userId, name, email, contact });

    if (!amount || !currency || !userId || !name) {
      return res.status(400).json({ error: 'Missing required fields: amount, currency, userId, name' });
    }

    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(400).json({ error: 'Amount must be an integer >= 100' });
    }

    if (!['INR'].includes(currency)) {
      return res.status(400).json({ error: 'Currency must be INR' });
    }

    if (contact && !/^\d{10}$/.test(contact)) {
      return res.status(400).json({ error: 'Contact must be a valid 10-digit phone number' });
    }

    if (email && !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Missing Razorpay credentials');
      return res.status(500).json({ error: 'Server configuration error: Missing Razorpay credentials' });
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: amount,
      currency: currency,
      receipt: `rcpt_${userId.slice(0, 20)}_${Date.now()}`.slice(0, 40),
      payment_capture: 1,
      notes: {
        userId,
        name,
        email,
        contact,
      },
    };

    const order = await razorpay.orders.create(options);
    console.log('Order created:', order);
    res.json({ orderId: order.id });
  } catch (err) {
    console.error('Error creating order:', {
      message: err.message,
      status: err.status,
      code: err.error?.code,
      description: err.error?.description,
      source: err.error?.source,
      step: err.error?.step,
      reason: err.error?.reason,
    });
    res.status(500).json({
      error: 'Failed to create order',
      details: err.message || 'Error creating order',
      razorpayError: err.error,
    });
  }
});

// Verify payment
app.post('/api/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    console.log('Verify payment request:', { razorpay_order_id, razorpay_payment_id });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('Missing Razorpay key secret');
      return res.status(500).json({ error: 'Server configuration error: missing Razorpay secret' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      console.log('Payment verified successfully');
      res.json({ status: 'success' });
    } else {
      console.log('Invalid signature');
      res.status(400).json({ error: 'Invalid signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment', details: error.message });
  }
});

// Handle unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
