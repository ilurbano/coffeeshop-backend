# Response Codes

### Generic (0xx)

| Event | Code |
|---|---|
| Success | 0 |
| Failed | 1 |
| Action required | 2 |

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
