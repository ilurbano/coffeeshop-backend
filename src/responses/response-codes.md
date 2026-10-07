# Response Codes

### Generic (0xx)

| Event | Code |
|---|---|
| Success | 0 |
| Failed | 1 |
| Action required | 2 |
| Internal server error | 3 |

### Auth (1xx)

#### Registration (10x)

| Event | Code |
|---|---|
| Registration success | 100 |
| User already exists | 101 |
| Missing required data | 102 |
| Invalid data | 103 |

#### Login (11x)

| Event | Code |
|---|---|
| Login success | 110 |
| User not exists | 111 |
| Missing required data | 112 |
| Invalid data | 113 |

#### Session (12x)

| Event | Code |
|---|---|
| Logout success | 120 |
| Invalid session | 121 |
| Forbidden | 122 |

#### Forgot Password (13x)

| Event | Code |
|---|---|
| Password reset success | 130 |
| Reset OTP verified | 131 |
| Password reset requested | 132 |
| User not exists | 133 |
| Missing required data | 134 |
| Invalid data | 135 |

#### Resource Access (14x)

| Event | Code |
|---|---|
| Granted | 140 |
| Denied | 141 |

### Product (2xx)

| Event | Code |
|---|---|
| Product operation success | 200 |
| Product not found | 201 |
| Missing required product data | 202 |
| Invalid product data | 203 |
| Product conflict | 204 |

### Order (3xx)

| Event | Code |
|---|---|
| Order operation success | 300 |
| Order not found | 301 |
| Missing required order data | 302 |
| Invalid order data | 303 |
| Invalid status transition | 304 |
| Insufficient stock | 305 |
| Invalid voucher | 306 |
| Rider conflict | 307 |
| Forbidden order operation | 308 |

### Voucher (4xx)

| Event | Code |
|---|---|
| Voucher operation success | 400 |
| Voucher not found | 401 |
| Missing required voucher data | 402 |
| Invalid voucher data | 403 |
| Voucher conflict | 404 |
| Voucher unavailable | 405 |
