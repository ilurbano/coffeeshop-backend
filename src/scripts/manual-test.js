#!/usr/bin/env node

/**
 * Coffee Shop Backend - Manual API Smoke Test
 *
 * Usage:
 *   node src/scripts/manual-test.js
 *
 * Optional environment variables:
 *   TEST_BASE_URL=http://localhost:3000
 *   TEST_CUSTOMER_EMAIL=...
 *   TEST_CUSTOMER_PASSWORD=...
 *   TEST_OP_EMAIL=...
 *   TEST_OP_PASSWORD=...
 *   TEST_DELIVERY_EMAIL=...
 *   TEST_DELIVERY_PASSWORD=...
 *
 * If customer credentials are omitted, a temporary customer account is
 * registered automatically. Operations and delivery tests are skipped unless
 * their respective credentials are provided.
 *
 * This script intentionally uses only Node.js built-ins. Node.js 18+ is
 * required because it relies on the built-in fetch API.
 */

'use strict';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 10000);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const state = {
  passed: 0,
  failed: 0,
  skipped: 0,
  customerToken: null,
  customer: null,
  operationsToken: null,
  deliveryToken: null,
  product: null,
  cancelledOrderId: null,
  deliveryOrderId: null,
};

const log = (message) => console.log(`${colors.cyan}[manual-test]${colors.reset} ${message}`);

const pass = (name, detail = '') => {
  state.passed += 1;
  console.log(`${colors.green}PASS${colors.reset} ${name}${detail ? ` ${colors.gray}(${detail})${colors.reset}` : ''}`);
};

const fail = (name, detail = '') => {
  state.failed += 1;
  console.log(`${colors.red}FAIL${colors.reset} ${name}${detail ? ` ${colors.gray}(${detail})${colors.reset}` : ''}`);
};

const skip = (name, detail = '') => {
  state.skipped += 1;
  console.log(`${colors.yellow}SKIP${colors.reset} ${name}${detail ? ` ${colors.gray}(${detail})${colors.reset}` : ''}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (method, path, { token, body, expected = [] } = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (expected.length && !expected.includes(response.status)) {
      throw new Error(
        `${method} ${path} returned HTTP ${response.status}; expected ${expected.join('/')}. ` +
        `Response: ${JSON.stringify(data)}`
      );
    }

    return { status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
};

const expectRequest = async (name, method, path, options = {}) => {
  try {
    const result = await request(method, path, options);
    pass(name, `HTTP ${result.status}`);
    return result;
  } catch (error) {
    fail(name, error.name === 'AbortError' ? `timed out after ${TIMEOUT_MS}ms` : error.message);
    return null;
  }
};

const responseData = (result) => result?.data?.payload;

const isUsableProduct = (product) =>
  product &&
  product._id &&
  product.isAddon === false &&
  product.status === 'available' &&
  Number.isInteger(product.stock) &&
  product.stock > 0;

const login = async (email, password, label) => {
  const result = await expectRequest(
    `${label}: login`,
    'POST',
    '/api/auth/login',
    {
      body: { email, password },
      expected: [200],
    }
  );

  const token = responseData(result)?.token;

  if (!token) {
    fail(`${label}: login response contains a token`, 'No token was returned.');
    return null;
  }

  return token;
};

const registerTemporaryCustomer = async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const customer = {
    firstName: 'Manual',
    lastName: 'Test',
    contactNumber: `09${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    username: `manual_test_${suffix}`.slice(0, 30),
    email: `manual.test.${suffix}@example.com`,
    password: 'ManualTest123!',
  };

  const result = await expectRequest(
    'Customer: register temporary account',
    'POST',
    '/api/auth/register-customer',
    {
      body: customer,
      expected: [201],
    }
  );

  if (!result) return null;

  return customer;
};

const authenticateCustomer = async () => {
  let credentials = {
    email: process.env.TEST_CUSTOMER_EMAIL,
    password: process.env.TEST_CUSTOMER_PASSWORD,
  };

  if (!credentials.email || !credentials.password) {
    credentials = await registerTemporaryCustomer();

    if (!credentials) return false;
  } else {
    log('Using TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD.');
  }

  const token = await login(credentials.email, credentials.password, 'Customer');

  if (!token) return false;

  state.customerToken = token;
  return true;
};

const authenticateOptionalRole = async (roleName, emailEnv, passwordEnv, label) => {
  const email = process.env[emailEnv];
  const password = process.env[passwordEnv];

  if (!email || !password) {
    skip(`${label}: authentication`, `${emailEnv} and ${passwordEnv} were not provided`);
    return null;
  }

  return login(email, password, label);
};

const getFirstAvailableProduct = async () => {
  const result = await expectRequest(
    'Products: list products',
    'GET',
    '/api/products',
    {
      token: state.customerToken,
      expected: [200],
    }
  );

  const products = responseData(result);

  if (!Array.isArray(products)) {
    fail('Products: response contains an array', 'Expected data to be an array.');
    return null;
  }

  const product = products.find(isUsableProduct);

  if (!product) {
    skip('Orders: usable product exists', 'No available non-addon product with stock > 0 was found.');
    return null;
  }

  pass('Products: usable product exists', `${product.name} / stock ${product.stock}`);
  return product;
};

const testAuthenticationAndAuthorization = async () => {
  await expectRequest(
    'Health endpoint',
    'GET',
    '/health',
    { expected: [200] }
  );

  await expectRequest(
    'Protected endpoint rejects missing token',
    'GET',
    '/api/products',
    { expected: [401] }
  );

  await expectRequest(
    'Operations endpoint rejects customer role',
    'GET',
    '/api/orders',
    {
      token: state.customerToken,
      expected: [403],
    }
  );
};

const createOrder = async ({ deliveryAddress } = {}) => {
  if (!state.product) return null;

  const body = {
    products: [
      {
        product: state.product._id,
        quantity: 1,
        addons: [],
      },
    ],
    paymentMethod: 'cash',
    notes: 'Created by manual backend smoke test.',
    ...(deliveryAddress ? { deliveryAddress } : {}),
  };

  const result = await expectRequest(
    deliveryAddress ? 'Order: create delivery order' : 'Order: create in-store order',
    'POST',
    '/api/orders',
    {
      token: state.customerToken,
      body,
      expected: [200],
    }
  );

  return responseData(result);
};

const testCustomerOrders = async () => {
  if (!state.product) return;

  const missingProducts = await expectRequest(
    'Order validation: missing products rejected',
    'POST',
    '/api/orders',
    {
      token: state.customerToken,
      body: { paymentMethod: 'cash' },
      expected: [400],
    }
  );

  if (!missingProducts) return;

  const order = await createOrder();

  if (!order?._id) {
    fail('Order: created order contains an ID');
    return;
  }

  state.cancelledOrderId = order._id;
  pass('Order: created order contains an ID', order._id);

  await expectRequest(
    'Order: customer can retrieve own order',
    'GET',
    `/api/orders/mine/${order._id}`,
    {
      token: state.customerToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Order: customer can list own orders',
    'GET',
    '/api/orders/mine',
    {
      token: state.customerToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Order: customer can cancel pending order',
    'POST',
    `/api/orders/mine/${order._id}/cancel`,
    {
      token: state.customerToken,
      body: { reason: 'Manual smoke test cleanup.' },
      expected: [200],
    }
  );
};

const testOperations = async () => {
  if (!state.operationsToken) return;

  await expectRequest(
    'Operations: list products',
    'GET',
    '/api/products',
    {
      token: state.operationsToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Operations: list orders',
    'GET',
    '/api/orders',
    {
      token: state.operationsToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Operations: list vouchers',
    'GET',
    '/api/vouchers',
    {
      token: state.operationsToken,
      expected: [200],
    }
  );

  if (state.cancelledOrderId) {
    await expectRequest(
      'Operations: retrieve order',
      'GET',
      `/api/orders/${state.cancelledOrderId}`,
      {
        token: state.operationsToken,
        expected: [200],
      }
    );
  }
};

const testDeliveryLifecycle = async () => {
  if (!state.deliveryToken) return;

  if (!state.operationsToken) {
    skip(
      'Delivery lifecycle',
      'TEST_OP_EMAIL / TEST_OP_PASSWORD are required to advance a test delivery order to ready.'
    );
    return;
  }

  if (!state.product) return;

  const deliveryAddress = {
    latitude: 14.5378,
    longitude: 120.985,
    apartmentBuildingLotNumber: 'Manual Test 1',
    street: 'Test Street',
    villageSubdivision: 'Test Subdivision',
    barangay: 'Barangay 76',
    city: 'Pasay City',
    province: 'Metro Manila',
    zipCode: '1300',
    riderInstructions: 'Manual smoke test delivery.',
  };

  const order = await createOrder({ deliveryAddress });

  if (!order?._id) {
    fail('Delivery order: created order contains an ID');
    return;
  }

  state.deliveryOrderId = order._id;

  const advance = async (status) => {
    const result = await expectRequest(
      `Order lifecycle: ${status}`,
      'PATCH',
      `/api/orders/${order._id}/status`,
      {
        token: state.operationsToken,
        body: { status },
        expected: [200],
      }
    );

    return Boolean(result);
  };

  if (!await advance('confirmed')) return;
  if (!await advance('queued')) return;
  if (!await advance('ready')) return;

  await expectRequest(
    'Delivery: available orders',
    'GET',
    '/api/orders/delivery/available',
    {
      token: state.deliveryToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Delivery: claim order',
    'POST',
    `/api/orders/delivery/${order._id}/claim`,
    {
      token: state.deliveryToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Delivery: my orders',
    'GET',
    '/api/orders/delivery/mine',
    {
      token: state.deliveryToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Delivery: ship order',
    'POST',
    `/api/orders/delivery/${order._id}/ship`,
    {
      token: state.deliveryToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Delivery: deliver order',
    'POST',
    `/api/orders/delivery/${order._id}/deliver`,
    {
      token: state.deliveryToken,
      expected: [200],
    }
  );

  await expectRequest(
    'Operations: record payment',
    'PATCH',
    `/api/orders/${order._id}/payment`,
    {
      token: state.operationsToken,
      body: {
        paymentStatus: 'paid',
        paymentAmount: Number(order.grandTotal),
        paymentChange: 0,
        paymentMethodProvider: 'manual-test',
        paymentReference: `MANUAL-${Date.now()}`,
      },
      expected: [200],
    }
  );

  await expectRequest(
    'Payment validation: negative amount rejected',
    'PATCH',
    `/api/orders/${order._id}/payment`,
    {
      token: state.operationsToken,
      body: {
        paymentStatus: 'paid',
        paymentAmount: -1,
      },
      expected: [400],
    }
  );
};

const run = async () => {
  console.log('');
  log(`Target: ${BASE_URL}`);
  log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log('');

  try {
    const customerReady = await authenticateCustomer();

    if (!customerReady) {
      throw new Error('Customer authentication could not be established.');
    }

    state.operationsToken = await authenticateOptionalRole(
      'operations',
      'TEST_OP_EMAIL',
      'TEST_OP_PASSWORD',
      'Operations'
    );

    state.deliveryToken = await authenticateOptionalRole(
      'delivery',
      'TEST_DELIVERY_EMAIL',
      'TEST_DELIVERY_PASSWORD',
      'Delivery'
    );

    await testAuthenticationAndAuthorization();

    state.product = await getFirstAvailableProduct();

    await testCustomerOrders();
    await testOperations();
    await testDeliveryLifecycle();
  } catch (error) {
    fail('Test runner', error.message);
  }

  console.log('');
  console.log(
    `${colors.cyan}Results${colors.reset}: ` +
    `${colors.green}${state.passed} passed${colors.reset}, ` +
    `${colors.red}${state.failed} failed${colors.reset}, ` +
    `${colors.yellow}${state.skipped} skipped${colors.reset}`
  );

  if (state.failed > 0) {
    process.exitCode = 1;
  }
};

run();
