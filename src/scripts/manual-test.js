#!/usr/bin/env node

/**
 * Coffee Shop Backend - Comprehensive Manual API Test Runner
 *
 * This is an HTTP-level integration/manual test. It intentionally tests the
 * public API rather than importing services/controllers directly.
 *
 * Requirements:
 *   - Node.js 18+ (built-in fetch)
 *   - Running Coffee Shop backend
 *   - Running MongoDB configured for that backend
 *
 * Usage:
 *   node src/scripts/manual-test.js
 *
 * Environment variables:
 *   TEST_BASE_URL=http://localhost:3000
 *   TEST_TIMEOUT_MS=10000
 *
 * Customer credentials are optional. If omitted, a unique temporary customer
 * is registered automatically.
 *   TEST_CUSTOMER_EMAIL=...
 *   TEST_CUSTOMER_PASSWORD=...
 *
 * Operations and delivery credentials are optional, but are strongly
 * recommended for complete coverage. Tokens may be supplied instead.
 *   TEST_OP_EMAIL=...
 *   TEST_OP_PASSWORD=...
 *   TEST_OP_TOKEN=...
 *   TEST_DELIVERY_EMAIL=...
 *   TEST_DELIVERY_PASSWORD=...
 *   TEST_DELIVERY_TOKEN=...
 *
 * The script never creates staff accounts because the application intentionally
 * exposes customer registration only. Without staff credentials, staff-only
 * tests are reported as SKIPPED rather than falsely passing.
 *
 * The runner creates unique test products/vouchers/orders. Product/voucher
 * records created by the runner are deliberately left in the database so the
 * resulting state can be inspected after a run; the main test product is
 * phase-out tested near the end.
 */

'use strict';

const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 10000);
const INVALID_ID = '000000000000000000000000';
const INVALID_OBJECT_ID = 'not-an-object-id';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

const state = {
  passed: 0,
  failed: 0,
  skipped: 0,
  startedAt: Date.now(),
  customer: null,
  customerToken: null,
  secondCustomer: null,
  secondCustomerToken: null,
  operationsToken: null,
  deliveryToken: null,
  addon: null,
  product: null,
  stockProduct: null,
  orderProduct: null,
  voucher: null,
  order: null,
  deliveryOrder: null,
  cancelledOrder: null,
};

const log = (message) =>
  console.log(`${colors.cyan}[manual-test]${colors.reset} ${message}`);

const section = (title) => {
  console.log('');
  console.log(`${colors.blue}=== ${title} ===${colors.reset}`);
};

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

const responsePayload = (result) => result?.data?.payload;
const responseCode = (result) => result?.data?.code;
const responseMessage = (result) => result?.data?.message;

const isObject = (value) => value !== null && typeof value === 'object';
const isNonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const isObjectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const request = async (method, path, options = {}) => {
  const {
    token,
    body,
    expectedStatus,
    expectedCode,
    check,
  } = options;

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

    const expected = Array.isArray(expectedStatus)
      ? expectedStatus
      : expectedStatus === undefined
        ? []
        : [expectedStatus];

    if (expected.length && !expected.includes(response.status)) {
      throw new Error(
        `HTTP ${response.status}; expected ${expected.join('/')} | ${JSON.stringify(data)}`
      );
    }

    if (expectedCode !== undefined && responseCode({ data }) !== expectedCode) {
      throw new Error(
        `response code ${responseCode({ data })}; expected ${expectedCode} | ${JSON.stringify(data)}`
      );
    }

    if (check) {
      const result = { status: response.status, data };
      const checkResult = await check(result);
      if (checkResult === false) {
        throw new Error(`response assertion failed | ${JSON.stringify(data)}`);
      }
      if (typeof checkResult === 'string') {
        throw new Error(checkResult);
      }
    }

    return { status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
};

const expectRequest = async (name, method, path, options = {}) => {
  try {
    const result = await request(method, path, options);
    pass(name, `HTTP ${result.status}${responseCode(result) !== undefined ? ` / code ${responseCode(result)}` : ''}`);
    return result;
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? `timed out after ${TIMEOUT_MS}ms`
      : error?.message || String(error);
    fail(name, detail);
    return null;
  }
};

const expectSkip = (name, reason) => skip(name, reason);

const loginWithCredentials = async (emailOrUsernameOrPhone, password, label) => {
  const result = await expectRequest(
    `${label}: login`,
    'POST',
    '/api/auth/login',
    {
      body: { email: emailOrUsernameOrPhone, password },
      expectedStatus: 200,
      check: ({ data }) => responsePayload({ data })?.token ? true : 'No JWT token returned.',
    }
  );

  return responsePayload(result)?.token || null;
};

const registerCustomer = async (label = 'Customer') => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const customer = {
    firstName: 'Manual',
    lastName: 'Test',
    contactNumber: `09${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    username: `manual_${suffix}`.slice(0, 30),
    email: `manual.${suffix}@example.com`,
    password: 'ManualTest123!',
  };

  const result = await expectRequest(
    `${label}: register temporary customer`,
    'POST',
    '/api/auth/register-customer',
    {
      body: customer,
      expectedStatus: 201,
      expectedCode: 100,
      check: ({ data }) => {
        const user = responsePayload({ data });
        if (!user?._id) return 'Registration did not return a user ID.';
        if (user.password !== undefined) return 'Registration leaked password.';
        return true;
      },
    }
  );

  return result ? customer : null;
};

const authenticateCustomer = async () => {
  if (process.env.TEST_CUSTOMER_TOKEN) {
    state.customerToken = process.env.TEST_CUSTOMER_TOKEN;
    log('Using TEST_CUSTOMER_TOKEN.');
    return true;
  }

  let credentials = {
    email: process.env.TEST_CUSTOMER_EMAIL,
    password: process.env.TEST_CUSTOMER_PASSWORD,
  };

  if (!credentials.email || !credentials.password) {
    credentials = await registerCustomer('Customer');
    if (!credentials) return false;
  } else {
    log('Using TEST_CUSTOMER_EMAIL / TEST_CUSTOMER_PASSWORD.');
  }

  state.customer = credentials;
  state.customerToken = await loginWithCredentials(
    credentials.email,
    credentials.password,
    'Customer'
  );

  return Boolean(state.customerToken);
};

const authenticateSecondCustomer = async () => {
  if (!state.customerToken) return false;
  const credentials = await registerCustomer('Second customer');
  if (!credentials) return false;

  state.secondCustomer = credentials;
  state.secondCustomerToken = await loginWithCredentials(
    credentials.email,
    credentials.password,
    'Second customer'
  );

  return Boolean(state.secondCustomerToken);
};

const authenticateRole = async ({ tokenEnv, emailEnv, passwordEnv, label }) => {
  if (process.env[tokenEnv]) {
    log(`Using ${tokenEnv}.`);
    return process.env[tokenEnv];
  }

  const email = process.env[emailEnv];
  const password = process.env[passwordEnv];

  if (!email || !password) {
    expectSkip(`${label}: authentication`, `${tokenEnv}, ${emailEnv}, or ${passwordEnv} not supplied.`);
    return null;
  }

  return loginWithCredentials(email, password, label);
};

const assertUnauthorized = async (name, method, path, body) =>
  expectRequest(name, method, path, {
    ...(body === undefined ? {} : { body }),
    expectedStatus: 401,
    expectedCode: 121,
  });

const assertForbidden = async (name, method, path, token, body) =>
  expectRequest(name, method, path, {
    token,
    ...(body === undefined ? {} : { body }),
    expectedStatus: 403,
    expectedCode: 122,
  });

const assertInvalidId = async (name, method, path, token, body) =>
  expectRequest(name, method, path, {
    token,
    ...(body === undefined ? {} : { body }),
    expectedStatus: 400,
  });

const testHealthAndSessionMiddleware = async () => {
  section('Health, authentication, and authorization middleware');

  await expectRequest('Health: GET /health', 'GET', '/health', { expectedStatus: 200 });

  await assertUnauthorized('Auth middleware: products reject missing token', 'GET', '/api/products');
  await assertUnauthorized('Auth middleware: orders reject missing token', 'GET', '/api/orders');
  await assertUnauthorized('Auth middleware: vouchers reject missing token', 'GET', '/api/vouchers');

  await expectRequest('Auth middleware: malformed bearer token rejected', 'GET', '/api/products', {
    token: 'definitely-not-a-jwt',
    expectedStatus: 401,
    expectedCode: 121,
  });

  await expectRequest('Auth middleware: malformed Authorization header rejected', 'GET', '/api/products', {
    token: undefined,
    expectedStatus: 401,
  });

  await expectRequest('Auth middleware: customer token is accepted', 'GET', '/api/products', {
    token: state.customerToken,
    expectedStatus: 200,
  });

  if (state.operationsToken) {
    await assertForbidden('Authorization: customer blocked from order operations', 'GET', '/api/orders', state.customerToken);
    await assertForbidden('Authorization: customer blocked from voucher operations', 'GET', '/api/vouchers', state.customerToken);
    await assertForbidden('Authorization: customer blocked from product creation', 'POST', '/api/products', state.customerToken, {});
  }
};

const testAuthenticationRoutes = async () => {
  section('Authentication routes and validations');

  await expectRequest('Auth: register missing required fields', 'POST', '/api/auth/register-customer', {
    body: {},
    expectedStatus: 400,
    expectedCode: 112,
    check: ({ data }) => {
      const fields = responsePayload({ data })?.missingFields;
      return Array.isArray(fields) && fields.includes('firstName') && fields.includes('email') && fields.includes('password')
        ? true
        : 'Missing-field list is incomplete.';
    },
  });

  await expectRequest('Auth: register rejects invalid email', 'POST', '/api/auth/register-customer', {
    body: {
      firstName: 'Invalid',
      lastName: 'Email',
      contactNumber: '09123456789',
      username: `bad_email_${Date.now()}`,
      email: 'not-an-email',
      password: 'ManualTest123!',
    },
    expectedStatus: 400,
    expectedCode: 113,
  });

  await expectRequest('Auth: register rejects invalid Philippine phone', 'POST', '/api/auth/register-customer', {
    body: {
      firstName: 'Invalid',
      lastName: 'Phone',
      contactNumber: '12345',
      username: `bad_phone_${Date.now()}`,
      email: `bad.phone.${Date.now()}@example.com`,
      password: 'ManualTest123!',
    },
    expectedStatus: 400,
    expectedCode: 113,
  });

  await expectRequest('Auth: register rejects password shorter than 8', 'POST', '/api/auth/register-customer', {
    body: {
      firstName: 'Short',
      lastName: 'Password',
      contactNumber: `09${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
      username: `short_pw_${Date.now()}`,
      email: `short.pw.${Date.now()}@example.com`,
      password: '1234567',
    },
    expectedStatus: 400,
    expectedCode: 113,
  });

  if (state.customer) {
    await expectRequest('Auth: duplicate customer registration rejected', 'POST', '/api/auth/register-customer', {
      body: state.customer,
      expectedStatus: 409,
      expectedCode: 101,
    });

    await loginWithCredentials(state.customer.username, state.customer.password, 'Customer username login');
    await loginWithCredentials(state.customer.contactNumber, state.customer.password, 'Customer phone login');
  }

  await expectRequest('Auth: login missing both fields', 'POST', '/api/auth/login', {
    body: {},
    expectedStatus: 400,
    expectedCode: 112,
  });

  await expectRequest('Auth: login missing password', 'POST', '/api/auth/login', {
    body: { email: state.customer?.email || 'missing@example.com' },
    expectedStatus: 400,
    expectedCode: 112,
  });

  await expectRequest('Auth: login unknown account rejected', 'POST', '/api/auth/login', {
    body: { email: `does.not.exist.${Date.now()}@example.com`, password: 'WrongPass123!' },
    expectedStatus: 401,
    expectedCode: 113,
  });

  if (state.customer) {
    await expectRequest('Auth: login wrong password rejected', 'POST', '/api/auth/login', {
      body: { email: state.customer.email, password: 'WrongPass123!' },
      expectedStatus: 401,
      expectedCode: 113,
    });
  }
};

const getProducts = async (token = state.customerToken, query = '') =>
  expectRequest('Products: list', 'GET', `/api/products${query}`, {
    token,
    expectedStatus: 200,
    check: ({ data }) => Array.isArray(responsePayload({ data })) ? true : 'Product payload is not an array.',
  });

const findUsableProduct = (products) => products?.find(
  (product) =>
    product?._id &&
    product.isAddon === false &&
    product.status === 'available' &&
    Number.isInteger(product.stock) &&
    product.stock > 0
);

const testProductRoutesCustomerSide = async () => {
  section('Product read routes and filters');

  const list = await getProducts();
  const products = responsePayload(list);

  await expectRequest('Products: filter by status', 'GET', '/api/products?status=available', {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data }).every((item) => item.status === 'available')
      ? true
      : 'Status filter returned a non-matching product.',
  });

  await expectRequest('Products: filter by isAddon=true', 'GET', '/api/products?isAddon=true', {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data }).every((item) => item.isAddon === true)
      ? true
      : 'isAddon=true returned a non-addon product.',
  });

  await expectRequest('Products: filter by isAddon=false', 'GET', '/api/products?isAddon=false', {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data }).every((item) => item.isAddon === false)
      ? true
      : 'isAddon=false returned an addon product.',
  });

  if (products?.length) {
    const product = products[0];
    state.orderProduct = findUsableProduct(products) || product;
    state.product = state.orderProduct;

    await expectRequest('Products: get existing product', 'GET', `/api/products/${product._id}`, {
      token: state.customerToken,
      expectedStatus: 200,
      check: ({ data }) => responsePayload({ data })?._id === product._id ? true : 'Returned product ID mismatch.',
    });
  } else {
    expectSkip('Products: existing product lookup', 'Database has no products.');
  }

  await assertInvalidId('Products: invalid product ID rejected', 'GET', `/api/products/${INVALID_OBJECT_ID}`, state.customerToken);
  await expectRequest('Products: valid-but-missing product returns 404', 'GET', `/api/products/${INVALID_ID}`, {
    token: state.customerToken,
    expectedStatus: 404,
  });
};

const productBody = ({ sku, name, isAddon = false, stock = 20, price = 120 } = {}) => ({
  sku: sku || `MANUAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  name: name || 'Manual Test Coffee',
  description: 'Product created by comprehensive manual API tests.',
  price,
  image: 'https://example.com/manual-test.png',
  category: isAddon ? 'Manual Addon' : 'Manual Test',
  isAddon,
  stock,
  allowedAddons: [],
});

const testProductOperations = async () => {
  section('Product operations, validation, conflicts, add-ons, and phase-out');

  if (!state.operationsToken) {
    expectSkip('Product operations suite', 'Operations credentials/token not supplied.');
    return;
  }

  await expectRequest('Products: create missing fields rejected', 'POST', '/api/products', {
    token: state.operationsToken,
    body: {},
    expectedStatus: 400,
    expectedCode: 202,
  });

  await expectRequest('Products: negative price rejected', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({ price: -1 }),
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: fractional stock rejected', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({ stock: 1.5 }),
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: nonexistent addon reference rejected', 'POST', '/api/products', {
    token: state.operationsToken,
    body: { ...productBody(), allowedAddons: [{ addon: INVALID_ID, minQuantity: 0, maxQuantity: 1 }] },
    expectedStatus: 400,
    expectedCode: 203,
  });

  const addonResult = await expectRequest('Products: create addon', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({ isAddon: true, stock: 100, price: 25, name: 'Manual Test Syrup' }),
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data })?._id ? true : 'Addon was not returned with an ID.',
  });

  if (!addonResult) return;
  state.addon = responsePayload(addonResult);

  const productResult = await expectRequest('Products: create main product', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({
      stock: 20,
      name: 'Manual Test Latte',
      price: 150,
    }),
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data })?._id ? true : 'Product was not returned with an ID.',
  });

  if (!productResult) return;
  state.product = responsePayload(productResult);
  state.orderProduct = state.product;

  await expectRequest('Products: duplicate SKU rejected', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({ sku: state.product.sku }),
    expectedStatus: 409,
    expectedCode: 204,
  });

  await expectRequest('Products: update invalid ID rejected', 'PATCH', `/api/products/${INVALID_OBJECT_ID}`, {
    token: state.operationsToken,
    body: { name: 'Invalid ID' },
    expectedStatus: 400,
  });

  await expectRequest('Products: update with no allowed fields rejected', 'PATCH', `/api/products/${state.product._id}`, {
    token: state.operationsToken,
    body: { ignoredField: 'ignored' },
    expectedStatus: 400,
    expectedCode: 202,
  });

  await expectRequest('Products: update negative price rejected', 'PATCH', `/api/products/${state.product._id}`, {
    token: state.operationsToken,
    body: { price: -10 },
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: update fractional stock rejected', 'PATCH', `/api/products/${state.product._id}`, {
    token: state.operationsToken,
    body: { stock: 1.25 },
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: update missing product returns 404', 'PATCH', `/api/products/${INVALID_ID}`, {
    token: state.operationsToken,
    body: { name: 'Missing product' },
    expectedStatus: 404,
    expectedCode: 201,
  });

  await expectRequest('Products: configure addons invalid body rejected', 'PUT', `/api/products/${state.product._id}/addons`, {
    token: state.operationsToken,
    body: { allowedAddons: 'not-an-array' },
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: configure addons duplicate entries rejected', 'PUT', `/api/products/${state.product._id}/addons`, {
    token: state.operationsToken,
    body: {
      allowedAddons: [
        { addon: state.addon._id, minQuantity: 0, maxQuantity: 1 },
        { addon: state.addon._id, minQuantity: 0, maxQuantity: 1 },
      ],
    },
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: configure addons invalid min/max rejected', 'PUT', `/api/products/${state.product._id}/addons`, {
    token: state.operationsToken,
    body: { allowedAddons: [{ addon: state.addon._id, minQuantity: 2, maxQuantity: 1 }] },
    expectedStatus: 400,
    expectedCode: 203,
  });

  await expectRequest('Products: configure valid addon rules', 'PUT', `/api/products/${state.product._id}/addons`, {
    token: state.operationsToken,
    body: { allowedAddons: [{ addon: state.addon._id, minQuantity: 0, maxQuantity: 2 }] },
    expectedStatus: 200,
  });

  await expectRequest('Products: update valid fields', 'PATCH', `/api/products/${state.product._id}`, {
    token: state.operationsToken,
    body: { name: 'Manual Test Latte Updated', price: 155, stock: 20 },
    expectedStatus: 200,
  });

  const addonQuery = await expectRequest('Products: addon filter contains created addon', 'GET', '/api/products?isAddon=true', {
    token: state.operationsToken,
    expectedStatus: 200,
  });

  if (addonQuery && !responsePayload(addonQuery).some((item) => item._id === state.addon._id)) {
    fail('Products: created addon is discoverable by filter', 'Created addon was not returned by isAddon=true.');
  } else if (addonQuery) {
    pass('Products: created addon is discoverable by filter');
  }

  const categoryQuery = await expectRequest('Products: category filter', 'GET', `/api/products?category=${encodeURIComponent(state.product.category)}`, {
    token: state.operationsToken,
    expectedStatus: 200,
  });

  if (categoryQuery && !responsePayload(categoryQuery).some((item) => item._id === state.product._id)) {
    fail('Products: category filter returns created product', 'Created product was not returned by category filter.');
  } else if (categoryQuery) {
    pass('Products: category filter returns created product');
  }
};

const deliveryAddress = () => ({
  latitude: 14.5378,
  longitude: 120.9850,
  apartmentBuildingLotNumber: 'Manual Test 1',
  street: 'Test Street',
  villageSubdivision: 'Test Subdivision',
  barangay: 'Barangay 76',
  city: 'Pasay City',
  province: 'Metro Manila',
  zipCode: '1300',
  riderInstructions: 'Leave with the guard. Manual API test.',
});

const createOrderBody = (overrides = {}) => ({
  products: [{ product: state.orderProduct?._id || state.product?._id, quantity: 1, addons: [] }],
  paymentMethod: 'cash',
  notes: 'Created by comprehensive manual API test.',
  ...overrides,
});

const createOrder = async (name, overrides = {}, expectedStatus = 200) => {
  const result = await expectRequest(name, 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody(overrides),
    expectedStatus,
  });
  return responsePayload(result);
};

const testOrderValidation = async () => {
  section('Order creation validation and pricing rules');

  if (!state.orderProduct?._id) {
    expectSkip('Order validation suite', 'No usable order product is available.');
    return;
  }

  await expectRequest('Orders: missing products rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 302,
  });

  await expectRequest('Orders: empty products rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 302,
  });

  await expectRequest('Orders: missing payment method rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ product: state.orderProduct._id, quantity: 1, addons: [] }] },
    expectedStatus: 400,
    expectedCode: 302,
  });

  await expectRequest('Orders: invalid product ID rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ product: INVALID_OBJECT_ID, quantity: 1, addons: [] }], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: missing product ID rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ quantity: 1, addons: [] }], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: zero quantity rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ product: state.orderProduct._id, quantity: 0, addons: [] }], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: fractional quantity rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ product: state.orderProduct._id, quantity: 1.5, addons: [] }], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: nonexistent product returns invalid data', 'POST', '/api/orders', {
    token: state.customerToken,
    body: { products: [{ product: INVALID_ID, quantity: 1, addons: [] }], paymentMethod: 'cash' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  if (state.addon && state.product) {
    await expectRequest('Orders: addon outside configured rules rejected', 'POST', '/api/orders', {
      token: state.customerToken,
      body: {
        products: [{ product: state.product._id, quantity: 1, addons: [{ addon: state.addon._id, quantity: 3 }] }],
        paymentMethod: 'cash',
      },
      expectedStatus: 400,
      expectedCode: 303,
    });

    await expectRequest('Orders: nonexistent addon rejected', 'POST', '/api/orders', {
      token: state.customerToken,
      body: {
        products: [{ product: state.product._id, quantity: 1, addons: [{ addon: INVALID_ID, quantity: 1 }] }],
        paymentMethod: 'cash',
      },
      expectedStatus: 400,
      expectedCode: 303,
    });

    const pricingResult = await expectRequest('Orders: configured addon is priced server-side', 'POST', '/api/orders', {
      token: state.customerToken,
      body: {
        products: [{ product: state.product._id, quantity: 1, addons: [{ addon: state.addon._id, quantity: 1, addonPrice: 999999 }] }],
        paymentMethod: 'cash',
      },
      expectedStatus: 200,
      check: ({ data }) => {
        const order = responsePayload({ data });
        const line = order?.products?.[0];
        if (!line) return 'Order line was not returned.';
        if (line.productPrice !== 155) return `Expected server price 155, got ${line.productPrice}.`;
        if (line.addons?.[0]?.addonPrice !== 25) return `Expected addon price 25, got ${line.addons?.[0]?.addonPrice}.`;
        return true;
      },
    });

    if (pricingResult) {
      const created = responsePayload(pricingResult);
      if (created?._id) {
        await expectRequest('Orders: cleanup addon-pricing test order', 'POST', `/api/orders/mine/${created._id}/cancel`, {
          token: state.customerToken,
          body: { reason: 'Cleanup after server-side pricing test.' },
          expectedStatus: 200,
        });
      }
    }
  }

  await expectRequest('Orders: invalid delivery latitude rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({ deliveryAddress: { ...deliveryAddress(), latitude: 91 } }),
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: invalid delivery longitude rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({ deliveryAddress: { ...deliveryAddress(), longitude: 181 } }),
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: delivery address missing required field rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({
      deliveryAddress: (() => {
        const address = deliveryAddress();
        delete address.street;
        return address;
      })(),
    }),
    expectedStatus: 400,
    expectedCode: 302,
  });

  await expectRequest('Orders: null delivery address accepted as omitted', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({ deliveryAddress: null }),
    expectedStatus: 200,
  });

  await expectRequest('Orders: invalid voucher ID rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({ voucherIds: [INVALID_OBJECT_ID] }),
    expectedStatus: 400,
    expectedCode: 306,
  });

  await expectRequest('Orders: foreign voucher ID rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: createOrderBody({ voucherIds: [INVALID_ID] }),
    expectedStatus: 400,
    expectedCode: 306,
  });
};

const testCustomerOrderRoutes = async () => {
  section('Customer order routes, ownership, cancellation, and stock rollback');

  if (!state.orderProduct?._id) {
    expectSkip('Customer order suite', 'No order product available.');
    return;
  }

  const order = await createOrder('Orders: create in-store order', { deliveryAddress: undefined });
  if (!order?._id) {
    expectSkip('Customer order ownership tests', 'Order could not be created.');
    return;
  }

  state.order = order;

  if (state.secondCustomerToken) {
    await expectRequest('Orders: second customer cannot read first customer order', 'GET', `/api/orders/mine/${order._id}`, {
      token: state.secondCustomerToken,
      expectedStatus: 404,
      expectedCode: 301,
    });

    await expectRequest('Orders: second customer cannot cancel first customer order', 'POST', `/api/orders/mine/${order._id}/cancel`, {
      token: state.secondCustomerToken,
      body: { reason: 'Ownership test.' },
      expectedStatus: 404,
      expectedCode: 301,
    });
  }

  await expectRequest('Orders: customer gets own order', 'GET', `/api/orders/mine/${order._id}`, {
    token: state.customerToken,
    expectedStatus: 200,
    expectedCode: 300,
    check: ({ data }) => responsePayload({ data })?._id === order._id ? true : 'Order ID mismatch.',
  });

  await expectRequest('Orders: customer lists own orders', 'GET', '/api/orders/mine', {
    token: state.customerToken,
    expectedStatus: 200,
    expectedCode: 300,
    check: ({ data }) => Array.isArray(responsePayload({ data })) ? true : 'Expected order array.',
  });

  await assertInvalidId('Orders: customer get invalid ID rejected', 'GET', `/api/orders/mine/${INVALID_OBJECT_ID}`, state.customerToken);
  await expectRequest('Orders: customer get missing ID returns 404', 'GET', `/api/orders/mine/${INVALID_ID}`, {
    token: state.customerToken,
    expectedStatus: 404,
    expectedCode: 301,
  });

  await assertInvalidId('Orders: customer cancel invalid ID rejected', 'POST', `/api/orders/mine/${INVALID_OBJECT_ID}/cancel`, state.customerToken, {});
  await expectRequest('Orders: customer cancel missing ID returns 404', 'POST', `/api/orders/mine/${INVALID_ID}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Missing order test.' },
    expectedStatus: 404,
    expectedCode: 301,
  });

  await expectRequest('Orders: customer cancels pending order', 'POST', `/api/orders/mine/${order._id}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Manual cancellation test.' },
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Orders: cancelled order cannot be cancelled again', 'POST', `/api/orders/mine/${order._id}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Second cancellation should fail.' },
    expectedStatus: 400,
    expectedCode: 304,
  });

  await expectRequest('Orders: cancelled order cannot transition to confirmed through customer route', 'POST', `/api/orders/mine/${order._id}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Still cancelled.' },
    expectedStatus: 400,
  });

  state.cancelledOrder = order;
};

const advanceOrder = async (orderId, status, token, name = `Orders: transition to ${status}`) =>
  expectRequest(name, 'PATCH', `/api/orders/${orderId}/status`, {
    token,
    body: { status },
    expectedStatus: 200,
    expectedCode: 300,
  });

const testOperationsOrderRoutes = async () => {
  section('Operations order routes, transitions, filters, rider assignment, and payment');

  if (!state.operationsToken) {
    expectSkip('Operations order suite', 'Operations credentials/token not supplied.');
    return;
  }

  await expectRequest('Orders: operations list', 'GET', '/api/orders', {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Orders: operations status filter', 'GET', '/api/orders?status=pending', {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 300,
    check: ({ data }) => responsePayload({ data }).every((item) => item.status === 'pending')
      ? true
      : 'Status filter returned non-pending order.',
  });

  await expectRequest('Orders: operations delivery rider filter', 'GET', '/api/orders?deliveryRider=not-an-id', {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await assertInvalidId('Orders: operations get invalid ID rejected', 'GET', `/api/orders/${INVALID_OBJECT_ID}`, state.operationsToken);
  await expectRequest('Orders: operations get missing ID returns 404', 'GET', `/api/orders/${INVALID_ID}`, {
    token: state.operationsToken,
    expectedStatus: 404,
    expectedCode: 301,
  });

  await assertInvalidId('Orders: status invalid ID rejected', 'PATCH', `/api/orders/${INVALID_OBJECT_ID}/status`, state.operationsToken, { status: 'confirmed' });
  await expectRequest('Orders: status missing order returns 404', 'PATCH', `/api/orders/${INVALID_ID}/status`, {
    token: state.operationsToken,
    body: { status: 'confirmed' },
    expectedStatus: 404,
    expectedCode: 301,
  });

  await assertInvalidId('Orders: payment invalid ID rejected', 'PATCH', `/api/orders/${INVALID_OBJECT_ID}/payment`, state.operationsToken, { paymentStatus: 'paid' });
  await expectRequest('Orders: payment missing order returns 404', 'PATCH', `/api/orders/${INVALID_ID}/payment`, {
    token: state.operationsToken,
    body: { paymentStatus: 'paid' },
    expectedStatus: 404,
    expectedCode: 301,
  });

  await assertInvalidId('Orders: rider invalid ID rejected', 'PATCH', `/api/orders/${INVALID_OBJECT_ID}/rider`, state.operationsToken, { riderId: INVALID_ID });
  await expectRequest('Orders: rider missing order returns 404', 'PATCH', `/api/orders/${INVALID_ID}/rider`, {
    token: state.operationsToken,
    body: { riderId: INVALID_ID },
    expectedStatus: 400,
  });

  if (!state.orderProduct?._id) return;

  const order = await createOrder('Orders: create operations lifecycle order');
  if (!order?._id) return;
  state.order = order;

  await expectRequest('Orders: operations get created order', 'GET', `/api/orders/${order._id}`, {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Orders: invalid transition pending -> queued rejected', 'PATCH', `/api/orders/${order._id}/status`, {
    token: state.operationsToken,
    body: { status: 'queued' },
    expectedStatus: 400,
    expectedCode: 304,
  });

  await expectRequest('Orders: invalid status value rejected', 'PATCH', `/api/orders/${order._id}/status`, {
    token: state.operationsToken,
    body: { status: 'definitely-invalid' },
    expectedStatus: 400,
    expectedCode: 304,
  });

  if (!await advanceOrder(order._id, 'confirmed', state.operationsToken)) return;
  if (!await advanceOrder(order._id, 'queued', state.operationsToken)) return;
  if (!await advanceOrder(order._id, 'ready', state.operationsToken)) return;

  await expectRequest('Orders: in-store ready -> claimed allowed', 'PATCH', `/api/orders/${order._id}/status`, {
    token: state.operationsToken,
    body: { status: 'claimed' },
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Orders: in-store claimed -> shipped rejected', 'PATCH', `/api/orders/${order._id}/status`, {
    token: state.operationsToken,
    body: { status: 'shipped' },
    expectedStatus: 400,
    expectedCode: 304,
  });

  await expectRequest('Orders: invalid payment status rejected', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: { paymentStatus: 'not-a-payment-status' },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: negative payment amount rejected', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: { paymentStatus: 'paid', paymentAmount: -1 },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: negative payment change rejected', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: { paymentStatus: 'paid', paymentChange: -1 },
    expectedStatus: 400,
    expectedCode: 303,
  });

  await expectRequest('Orders: payment can be recorded as pending', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: {
      paymentStatus: 'pending',
      paymentAmount: 0,
      paymentChange: 0,
      paymentReference: 'MANUAL-PENDING',
      paymentMethodProvider: 'manual-test',
    },
    expectedStatus: 200,
  });

  await expectRequest('Orders: payment can be recorded as failed', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: { paymentStatus: 'failed', paymentAmount: 0, paymentChange: 0 },
    expectedStatus: 200,
  });

  await expectRequest('Orders: payment can be recorded as paid', 'PATCH', `/api/orders/${order._id}/payment`, {
    token: state.operationsToken,
    body: {
      paymentStatus: 'paid',
      paymentAmount: Number(order.grandTotal),
      paymentChange: 0,
      paymentReference: `MANUAL-${Date.now()}`,
      paymentMethodProvider: 'manual-test',
    },
    expectedStatus: 200,
  });

  if (state.deliveryToken) {
    const deliveryOrder = await createOrder('Orders: create delivery lifecycle order', {
      deliveryAddress: deliveryAddress(),
    });

    if (deliveryOrder?._id) {
      state.deliveryOrder = deliveryOrder;

      if (await advanceOrder(deliveryOrder._id, 'confirmed', state.operationsToken, 'Delivery order: pending -> confirmed')) {
        if (await advanceOrder(deliveryOrder._id, 'queued', state.operationsToken, 'Delivery order: confirmed -> queued')) {
          await expectRequest('Orders: assign rider with invalid rider ID rejected', 'PATCH', `/api/orders/${deliveryOrder._id}/rider`, {
            token: state.operationsToken,
            body: { riderId: INVALID_OBJECT_ID },
            expectedStatus: 400,
            expectedCode: 303,
          });

          const deliveryUserId = await getTokenUserId(state.deliveryToken);
          if (deliveryUserId) {
            await expectRequest('Orders: assign delivery rider', 'PATCH', `/api/orders/${deliveryOrder._id}/rider`, {
              token: state.operationsToken,
              body: { riderId: deliveryUserId },
              expectedStatus: 200,
            });
          }
        }
      }
    }
  } else {
    expectSkip('Orders: delivery lifecycle creation', 'Delivery credentials/token not supplied.');
  }
};

const getTokenUserId = async (token) => {
  // JWT payload is deliberately not trusted as authorization; this helper is
  // only used to discover the already-authenticated delivery user's ID for an
  // operation-side rider assignment test. The API itself remains authoritative.
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return isObjectId(payload.id) ? payload.id : null;
  } catch {
    return null;
  }
};

const testDeliveryRoutes = async () => {
  section('Delivery routes, ownership, conflicts, and lifecycle');

  if (!state.deliveryToken) {
    expectSkip('Delivery route suite', 'Delivery credentials/token not supplied.');
    return;
  }

  await expectRequest('Delivery: available orders', 'GET', '/api/orders/delivery/available', {
    token: state.deliveryToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Delivery: my orders', 'GET', '/api/orders/delivery/mine', {
    token: state.deliveryToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await assertInvalidId('Delivery: claim invalid ID rejected', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/claim`, state.deliveryToken);
  await assertInvalidId('Delivery: ship invalid ID rejected', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/ship`, state.deliveryToken);
  await assertInvalidId('Delivery: deliver invalid ID rejected', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/deliver`, state.deliveryToken);

  await expectRequest('Delivery: claim missing order returns not found/conflict', 'POST', `/api/orders/delivery/${INVALID_ID}/claim`, {
    token: state.deliveryToken,
    expectedStatus: [404, 409],
  });

  await expectRequest('Delivery: ship missing order returns 404', 'POST', `/api/orders/delivery/${INVALID_ID}/ship`, {
    token: state.deliveryToken,
    expectedStatus: 404,
    expectedCode: 301,
  });

  await expectRequest('Delivery: deliver missing order returns 404', 'POST', `/api/orders/delivery/${INVALID_ID}/deliver`, {
    token: state.deliveryToken,
    expectedStatus: 404,
    expectedCode: 301,
  });

  if (!state.operationsToken || !state.orderProduct?._id) {
    expectSkip('Delivery: full lifecycle', 'Operations token and order product are required.');
    return;
  }

  const order = state.deliveryOrder || await createOrder('Delivery: create dedicated delivery order', {
    deliveryAddress: deliveryAddress(),
  });

  if (!order?._id) return;
  state.deliveryOrder = order;

  const riderId = await getTokenUserId(state.deliveryToken);
  if (!riderId) {
    expectSkip('Delivery: rider assignment/claim lifecycle', 'Could not read delivery user ID from supplied JWT.');
    return;
  }

  const move = async (status) => {
    const result = await advanceOrder(order._id, status, state.operationsToken, `Delivery lifecycle: ${status}`);
    return Boolean(result);
  };

  if (order.status === 'pending' && !await move('confirmed')) return;
  if (order.status === 'confirmed' && !await move('queued')) return;

  await expectRequest('Delivery: cannot claim before ready', 'POST', `/api/orders/delivery/${order._id}/claim`, {
    token: state.deliveryToken,
    expectedStatus: 404,
  });

  await expectRequest('Orders: assign rider before ready is rejected', 'PATCH', `/api/orders/${order._id}/rider`, {
    token: state.operationsToken,
    body: { riderId },
    expectedStatus: 400,
    expectedCode: 304,
  });

  if (!await move('ready')) return;

  await expectRequest('Delivery: claim ready order', 'POST', `/api/orders/delivery/${order._id}/claim`, {
    token: state.deliveryToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Delivery: claim already-claimed order is conflict', 'POST', `/api/orders/delivery/${order._id}/claim`, {
    token: state.deliveryToken,
    expectedStatus: 409,
    expectedCode: 307,
  });

  await expectRequest('Delivery: ship claimed order', 'POST', `/api/orders/delivery/${order._id}/ship`, {
    token: state.deliveryToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Delivery: ship already-shipped order rejected', 'POST', `/api/orders/delivery/${order._id}/ship`, {
    token: state.deliveryToken,
    expectedStatus: 400,
    expectedCode: 304,
  });

  await expectRequest('Delivery: deliver shipped order', 'POST', `/api/orders/delivery/${order._id}/deliver`, {
    token: state.deliveryToken,
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Delivery: deliver already-delivered order rejected', 'POST', `/api/orders/delivery/${order._id}/deliver`, {
    token: state.deliveryToken,
    expectedStatus: 400,
    expectedCode: 304,
  });
};

const voucherBody = ({ code, discountType = 'fixed', discountValue = 10, startDate, endDate, usageLimitPublic = 1, usageLimitPerUser = 1, allowedProducts = [] } = {}) => ({
  voucher: {
    code: code || `MANUAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: 'Manual Test Voucher',
    description: 'Voucher created by comprehensive manual API tests.',
    termsAndConditions: 'For manual API testing only.',
    discountType,
    discountValue,
    minOrderValue: 0,
    allowedProducts,
    maxDiscountValue: discountType === 'percentage' ? 50 : discountValue,
  },
  startDate: startDate || new Date(Date.now() - 60_000).toISOString(),
  endDate: endDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  usageLimitPublic,
  usageLimitPerUser,
});

const testVoucherOperationsAndCustomerRoutes = async () => {
  section('Voucher CRUD, validation, claiming, ownership, and soft deletion');

  if (!state.operationsToken) {
    expectSkip('Voucher operations suite', 'Operations credentials/token not supplied.');
    return;
  }

  await expectRequest('Vouchers: list', 'GET', '/api/vouchers', {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 400,
    check: ({ data }) => Array.isArray(responsePayload({ data })) ? true : 'Voucher list is not an array.',
  });

  await expectRequest('Vouchers: list by code filter', 'GET', '/api/vouchers?code=__MANUAL_NONEXISTENT__', {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 400,
    check: ({ data }) => Array.isArray(responsePayload({ data })) && responsePayload({ data }).length === 0
      ? true
      : 'Expected empty result for unknown voucher code.',
  });

  await expectRequest('Vouchers: create missing fields rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: {},
    expectedStatus: 400,
    expectedCode: 402,
  });

  await expectRequest('Vouchers: invalid discount type rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ discountType: 'bogus' }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: percentage over 100 rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ discountType: 'percentage', discountValue: 101 }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: negative discount rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ discountValue: -1 }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: negative min order rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: { ...voucherBody(), voucher: { ...voucherBody().voucher, minOrderValue: -1 } },
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: negative max discount rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: { ...voucherBody(), voucher: { ...voucherBody().voucher, maxDiscountValue: -1 } },
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: invalid date range rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({
      startDate: new Date(Date.now() + 3600_000).toISOString(),
      endDate: new Date(Date.now() - 3600_000).toISOString(),
    }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: fractional public usage limit rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ usageLimitPublic: 1.5 }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: negative per-user limit rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ usageLimitPerUser: -1 }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: invalid allowed product structure rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ allowedProducts: [{ product: INVALID_OBJECT_ID, minQuantity: 1, addons: [] }] }),
    expectedStatus: 400,
    expectedCode: 403,
  });

  if (state.product && state.addon) {
    await expectRequest('Vouchers: duplicate allowed product rejected', 'POST', '/api/vouchers', {
      token: state.operationsToken,
      body: voucherBody({
        allowedProducts: [
          { product: state.product._id, minQuantity: 1, addons: [] },
          { product: state.product._id, minQuantity: 1, addons: [] },
        ],
      }),
      expectedStatus: 400,
      expectedCode: 403,
    });

    await expectRequest('Vouchers: duplicate allowed addon rejected', 'POST', '/api/vouchers', {
      token: state.operationsToken,
      body: voucherBody({
        allowedProducts: [{
          product: state.product._id,
          minQuantity: 1,
          addons: [
            { addon: state.addon._id, quantity: 1 },
            { addon: state.addon._id, quantity: 1 },
          ],
        }],
      }),
      expectedStatus: 400,
      expectedCode: 403,
    });
  }

  const createResult = await expectRequest('Vouchers: create valid voucher', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody(),
    expectedStatus: 200,
    expectedCode: 400,
    check: ({ data }) => responsePayload({ data })?._id ? true : 'Voucher template ID missing.',
  });

  if (!createResult) return;
  state.voucher = responsePayload(createResult);

  await expectRequest('Vouchers: duplicate code rejected', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({ code: state.voucher.voucher.code }),
    expectedStatus: 409,
    expectedCode: 404,
  });

  await assertInvalidId('Vouchers: get invalid ID rejected', 'GET', `/api/vouchers/${INVALID_OBJECT_ID}`, state.operationsToken);
  await expectRequest('Vouchers: get missing ID returns 404', 'GET', `/api/vouchers/${INVALID_ID}`, {
    token: state.operationsToken,
    expectedStatus: 404,
    expectedCode: 401,
  });

  await expectRequest('Vouchers: get created voucher', 'GET', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 400,
  });

  await expectRequest('Vouchers: update invalid ID rejected', 'PATCH', `/api/vouchers/${INVALID_OBJECT_ID}`, {
    token: state.operationsToken,
    body: { usageLimitPublic: 2 },
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: update invalid discount value rejected', 'PATCH', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    body: { discountValue: -5 },
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: update invalid date range rejected', 'PATCH', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    body: {
      startDate: new Date(Date.now() + 10_000).toISOString(),
      endDate: new Date(Date.now() - 10_000).toISOString(),
    },
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: update valid voucher', 'PATCH', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    body: { name: 'Manual Test Voucher Updated', usageLimitPublic: 1 },
    expectedStatus: 200,
    expectedCode: 400,
  });

  if (state.customerToken) {
    await expectRequest('Vouchers: customer list own vouchers', 'GET', '/api/vouchers/customer/mine', {
      token: state.customerToken,
      expectedStatus: 200,
      expectedCode: 400,
      check: ({ data }) => Array.isArray(responsePayload({ data })) ? true : 'Customer voucher list is not an array.',
    });

    await expectRequest('Vouchers: customer claim missing code rejected', 'POST', '/api/vouchers/claim', {
      token: state.customerToken,
      body: {},
      expectedStatus: 400,
      expectedCode: 402,
    });

    await expectRequest('Vouchers: customer claim nonexistent code returns 404', 'POST', '/api/vouchers/claim', {
      token: state.customerToken,
      body: { code: `NO-SUCH-VOUCHER-${Date.now()}` },
      expectedStatus: 404,
      expectedCode: 401,
    });

    const claimResult = await expectRequest('Vouchers: customer claims valid voucher', 'POST', '/api/vouchers/claim', {
      token: state.customerToken,
      body: { code: state.voucher.voucher.code },
      expectedStatus: 200,
      expectedCode: 400,
      check: ({ data }) => responsePayload({ data })?._id ? true : 'Voucher instance ID missing.',
    });

    const instance = responsePayload(claimResult);

    if (instance?._id) {
      await expectRequest('Vouchers: customer gets own voucher', 'GET', `/api/vouchers/customer/mine/${instance._id}`, {
        token: state.customerToken,
        expectedStatus: 200,
        expectedCode: 400,
      });

      await assertInvalidId('Vouchers: customer get invalid ID rejected', 'GET', `/api/vouchers/customer/mine/${INVALID_OBJECT_ID}`, state.customerToken);
      await expectRequest('Vouchers: customer get foreign/missing voucher returns 404', 'GET', `/api/vouchers/customer/mine/${INVALID_ID}`, {
        token: state.customerToken,
        expectedStatus: 404,
        expectedCode: 401,
      });

      await expectRequest('Vouchers: customer cannot claim same per-user-limited voucher twice', 'POST', '/api/vouchers/claim', {
        token: state.customerToken,
        body: { code: state.voucher.voucher.code },
        expectedStatus: 400,
        expectedCode: 405,
      });

      if (state.secondCustomerToken) {
        await expectRequest('Vouchers: second customer can claim public voucher only if public limit remains', 'POST', '/api/vouchers/claim', {
          token: state.secondCustomerToken,
          body: { code: state.voucher.voucher.code },
          expectedStatus: 400,
          expectedCode: 405,
        });
      }
    }
  }

  await expectRequest('Vouchers: delete invalid ID rejected', 'DELETE', `/api/vouchers/${INVALID_OBJECT_ID}`, {
    token: state.operationsToken,
    expectedStatus: 400,
    expectedCode: 403,
  });

  await expectRequest('Vouchers: soft-delete created voucher', 'DELETE', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 400,
  });

  await expectRequest('Vouchers: deleted voucher is hidden from get', 'GET', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    expectedStatus: 404,
    expectedCode: 401,
  });

  await expectRequest('Vouchers: deleted voucher cannot be updated', 'PATCH', `/api/vouchers/${state.voucher._id}`, {
    token: state.operationsToken,
    body: { name: 'Should not update' },
    expectedStatus: 404,
    expectedCode: 401,
  });

  await expectRequest('Vouchers: deleted voucher cannot be claimed', 'POST', '/api/vouchers/claim', {
    token: state.customerToken,
    body: { code: state.voucher.voucher.code },
    expectedStatus: 404,
    expectedCode: 401,
  });
};

const testVoucherOrderIntegration = async () => {
  section('Voucher + order integration and rollback');

  if (!state.operationsToken || !state.orderProduct?._id) {
    expectSkip('Voucher/order integration', 'Operations token and order product are required.');
    return;
  }

  const code = `MANUAL-ORDER-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const createResult = await expectRequest('Vouchers: create order-test voucher', 'POST', '/api/vouchers', {
    token: state.operationsToken,
    body: voucherBody({
      code,
      discountType: 'fixed',
      discountValue: 10,
      usageLimitPublic: 1,
      usageLimitPerUser: 1,
      allowedProducts: [{ product: state.orderProduct._id, minQuantity: 1, addons: [] }],
    }),
    expectedStatus: 200,
    expectedCode: 400,
  });

  if (!createResult) return;
  const template = responsePayload(createResult);

  const claim = await expectRequest('Vouchers: claim order-test voucher', 'POST', '/api/vouchers/claim', {
    token: state.customerToken,
    body: { code },
    expectedStatus: 200,
    expectedCode: 400,
  });

  const instance = responsePayload(claim);
  if (!instance?._id) return;

  const order = await createOrder('Orders: apply claimed voucher', {
    voucherIds: [instance._id],
  });

  if (!order?._id) return;

  if (order.vouchersApplied?.length !== 1 || Number(order.vouchersApplied[0].discountAmount) !== 10) {
    fail('Orders: voucher discount applied correctly', `Unexpected vouchersApplied: ${JSON.stringify(order.vouchersApplied)}`);
  } else {
    pass('Orders: voucher discount applied correctly');
  }

  await expectRequest('Vouchers: used instance appears in customer list', 'GET', '/api/vouchers/customer/mine', {
    token: state.customerToken,
    expectedStatus: 200,
    expectedCode: 400,
    check: ({ data }) => responsePayload({ data }).some((item) => item._id === instance._id && item.status === 'used')
      ? true
      : 'Voucher instance was not marked used.',
  });

  await expectRequest('Orders: cancel voucher order restores voucher', 'POST', `/api/orders/mine/${order._id}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Test voucher rollback on cancellation.' },
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Vouchers: cancelled order restores voucher to active', 'GET', `/api/vouchers/customer/mine/${instance._id}`, {
    token: state.customerToken,
    expectedStatus: 200,
    expectedCode: 400,
    check: ({ data }) => responsePayload({ data })?.status === 'active'
      ? true
      : `Expected active voucher, got ${responsePayload({ data })?.status}.`,
  });

  await expectRequest('Vouchers: deleted order-test template cleanup', 'DELETE', `/api/vouchers/${template._id}`, {
    token: state.operationsToken,
    expectedStatus: 200,
  });
};

const testStockAndStateRollback = async () => {
  section('Inventory reservation, out-of-stock state, and cancellation rollback');

  if (!state.operationsToken) {
    expectSkip('Inventory rollback suite', 'Operations token not supplied.');
    return;
  }

  const result = await expectRequest('Products: create one-stock product', 'POST', '/api/products', {
    token: state.operationsToken,
    body: productBody({ name: 'Manual One Stock Product', stock: 1, price: 50 }),
    expectedStatus: 200,
  });

  if (!result) return;
  state.stockProduct = responsePayload(result);

  const first = await createOrder('Orders: reserve final stock unit', {
    products: [{ product: state.stockProduct._id, quantity: 1, addons: [] }],
  });

  if (!first?._id) return;

  await expectRequest('Products: reserved stock becomes out_of_stock', 'GET', `/api/products/${state.stockProduct._id}`, {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data })?.status === 'out_of_stock' && responsePayload({ data })?.stock === 0
      ? true
      : `Unexpected stock state: ${JSON.stringify(responsePayload({ data }))}`,
  });

  await expectRequest('Orders: insufficient stock rejected', 'POST', '/api/orders', {
    token: state.customerToken,
    body: {
      products: [{ product: state.stockProduct._id, quantity: 1, addons: [] }],
      paymentMethod: 'cash',
    },
    expectedStatus: 400,
    expectedCode: 305,
  });

  await expectRequest('Orders: cancelling stock-consuming order restores inventory', 'POST', `/api/orders/mine/${first._id}/cancel`, {
    token: state.customerToken,
    body: { reason: 'Restore inventory after stock test.' },
    expectedStatus: 200,
    expectedCode: 300,
  });

  await expectRequest('Products: cancellation restores stock and availability', 'GET', `/api/products/${state.stockProduct._id}`, {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data })?.status === 'available' && responsePayload({ data })?.stock === 1
      ? true
      : `Unexpected restored stock state: ${JSON.stringify(responsePayload({ data }))}`,
  });
};

const testCrossRoleAuthorization = async () => {
  section('Cross-role authorization matrix');

  if (state.customerToken) {
    await assertForbidden('Customer: cannot list operations orders', 'GET', '/api/orders', state.customerToken);
    await assertForbidden('Customer: cannot list operations vouchers', 'GET', '/api/vouchers', state.customerToken);
    await assertForbidden('Customer: cannot create products', 'POST', '/api/products', state.customerToken, {});
    await assertForbidden('Customer: cannot update products', 'PATCH', `/api/products/${state.product?._id || INVALID_ID}`, state.customerToken, { name: 'Forbidden' });
    await assertForbidden('Customer: cannot configure product addons', 'PUT', `/api/products/${state.product?._id || INVALID_ID}/addons`, state.customerToken, { allowedAddons: [] });
    await assertForbidden('Customer: cannot phase out products', 'DELETE', `/api/products/${state.product?._id || INVALID_ID}`, state.customerToken);
    await assertForbidden('Customer: cannot create vouchers', 'POST', '/api/vouchers', state.customerToken, {});
    await assertForbidden('Customer: cannot update vouchers', 'PATCH', `/api/vouchers/${state.voucher?._id || INVALID_ID}`, state.customerToken, {});
    await assertForbidden('Customer: cannot delete vouchers', 'DELETE', `/api/vouchers/${state.voucher?._id || INVALID_ID}`, state.customerToken);
  }

  if (state.operationsToken) {
    await assertForbidden('Operations: cannot create customer order', 'POST', '/api/orders', state.operationsToken, {});
    await assertForbidden('Operations: cannot read customer order list', 'GET', '/api/orders/mine', state.operationsToken);
    await assertForbidden('Operations: cannot use delivery available route', 'GET', '/api/orders/delivery/available', state.operationsToken);
    await assertForbidden('Operations: cannot use delivery mine route', 'GET', '/api/orders/delivery/mine', state.operationsToken);
    await assertForbidden('Operations: cannot claim delivery route', 'POST', `/api/orders/delivery/${INVALID_ID}/claim`, state.operationsToken);
    await assertForbidden('Operations: cannot ship delivery route', 'POST', `/api/orders/delivery/${INVALID_ID}/ship`, state.operationsToken);
    await assertForbidden('Operations: cannot deliver delivery route', 'POST', `/api/orders/delivery/${INVALID_ID}/deliver`, state.operationsToken);
    await assertForbidden('Operations: cannot claim customer vouchers', 'POST', '/api/vouchers/claim', state.operationsToken, { code: 'NOPE' });
    await assertForbidden('Operations: cannot list customer vouchers', 'GET', '/api/vouchers/customer/mine', state.operationsToken);
  }

  if (state.deliveryToken) {
    await assertForbidden('Delivery: cannot create customer order', 'POST', '/api/orders', state.deliveryToken, {});
    await assertForbidden('Delivery: cannot read customer order list', 'GET', '/api/orders/mine', state.deliveryToken);
    await assertForbidden('Delivery: cannot list operations orders', 'GET', '/api/orders', state.deliveryToken);
    await assertForbidden('Delivery: cannot list operations vouchers', 'GET', '/api/vouchers', state.deliveryToken);
    await assertForbidden('Delivery: cannot create products', 'POST', '/api/products', state.deliveryToken, {});
    await assertForbidden('Delivery: cannot create vouchers', 'POST', '/api/vouchers', state.deliveryToken, {});
  }
};

const testRemainingRouteValidationAndNotFoundCases = async () => {
  section('Remaining route-level invalid IDs and edge cases');

  if (state.customerToken) {
    await assertInvalidId('Customer order cancel invalid ID', 'POST', `/api/orders/mine/${INVALID_OBJECT_ID}/cancel`, state.customerToken, {});
    await assertInvalidId('Customer voucher lookup invalid ID', 'GET', `/api/vouchers/customer/mine/${INVALID_OBJECT_ID}`, state.customerToken);
  }

  if (state.operationsToken) {
    await assertInvalidId('Operations product update invalid ID', 'PATCH', `/api/products/${INVALID_OBJECT_ID}`, state.operationsToken, { name: 'Invalid' });
    await assertInvalidId('Operations addon config invalid ID', 'PUT', `/api/products/${INVALID_OBJECT_ID}/addons`, state.operationsToken, { allowedAddons: [] });
    await assertInvalidId('Operations product phase-out invalid ID', 'DELETE', `/api/products/${INVALID_OBJECT_ID}`, state.operationsToken);
    await assertInvalidId('Operations voucher get invalid ID', 'GET', `/api/vouchers/${INVALID_OBJECT_ID}`, state.operationsToken);
    await assertInvalidId('Operations voucher update invalid ID', 'PATCH', `/api/vouchers/${INVALID_OBJECT_ID}`, state.operationsToken, { name: 'Invalid' });
    await assertInvalidId('Operations voucher delete invalid ID', 'DELETE', `/api/vouchers/${INVALID_OBJECT_ID}`, state.operationsToken);
  }

  if (state.deliveryToken) {
    await assertInvalidId('Delivery claim invalid ID', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/claim`, state.deliveryToken);
    await assertInvalidId('Delivery ship invalid ID', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/ship`, state.deliveryToken);
    await assertInvalidId('Delivery deliver invalid ID', 'POST', `/api/orders/delivery/${INVALID_OBJECT_ID}/deliver`, state.deliveryToken);
  }
};

const testProductPhaseOut = async () => {
  section('Product phase-out behavior');

  if (!state.operationsToken || !state.product?._id) {
    expectSkip('Product phase-out', 'Operations token or test product unavailable.');
    return;
  }

  await expectRequest('Products: phase out test product', 'DELETE', `/api/products/${state.product._id}`, {
    token: state.operationsToken,
    expectedStatus: 200,
    expectedCode: 200,
  });

  await expectRequest('Products: phased-out product remains retrievable', 'GET', `/api/products/${state.product._id}`, {
    token: state.customerToken,
    expectedStatus: 200,
    check: ({ data }) => responsePayload({ data })?.status === 'phased_out'
      ? true
      : `Expected phased_out, got ${responsePayload({ data })?.status}.`,
  });

  await expectRequest('Orders: phased-out product cannot be ordered', 'POST', '/api/orders', {
    token: state.customerToken,
    body: {
      products: [{ product: state.product._id, quantity: 1, addons: [] }],
      paymentMethod: 'cash',
    },
    expectedStatus: 400,
    expectedCode: 303,
  });
};

const run = async () => {
  console.log('');
  log(`Target: ${BASE_URL}`);
  log(`Timeout: ${TIMEOUT_MS}ms`);
  log('Comprehensive HTTP route/validation test suite starting.');

  try {
    const customerReady = await authenticateCustomer();
    if (!customerReady) throw new Error('Customer authentication could not be established.');

    await authenticateSecondCustomer();

    state.operationsToken = await authenticateRole({
      tokenEnv: 'TEST_OP_TOKEN',
      emailEnv: 'TEST_OP_EMAIL',
      passwordEnv: 'TEST_OP_PASSWORD',
      label: 'Operations',
    });

    state.deliveryToken = await authenticateRole({
      tokenEnv: 'TEST_DELIVERY_TOKEN',
      emailEnv: 'TEST_DELIVERY_EMAIL',
      passwordEnv: 'TEST_DELIVERY_PASSWORD',
      label: 'Delivery',
    });

    await testHealthAndSessionMiddleware();
    await testAuthenticationRoutes();
    await testProductRoutesCustomerSide();
    await testProductOperations();
    await testOrderValidation();
    await testCustomerOrderRoutes();
    await testOperationsOrderRoutes();
    await testDeliveryRoutes();
    await testVoucherOperationsAndCustomerRoutes();
    await testVoucherOrderIntegration();
    await testStockAndStateRollback();
    await testCrossRoleAuthorization();
    await testRemainingRouteValidationAndNotFoundCases();
    await testProductPhaseOut();
  } catch (error) {
    fail('Test runner', error?.stack || error?.message || String(error));
  }

  const seconds = ((Date.now() - state.startedAt) / 1000).toFixed(1);

  console.log('');
  console.log(`${colors.cyan}=== Results ===${colors.reset}`);
  console.log(`${colors.green}${state.passed} passed${colors.reset}`);
  console.log(`${colors.red}${state.failed} failed${colors.reset}`);
  console.log(`${colors.yellow}${state.skipped} skipped${colors.reset}`);
  console.log(`${colors.gray}Duration: ${seconds}s${colors.reset}`);
  console.log('');

  if (state.failed > 0) process.exitCode = 1;
};

run();
