# Banking System Project

A Node.js and Express banking ledger API backed by MongoDB and Mongoose. The project provides user authentication, account management, balance lookup, and money transfer flows built around an immutable ledger model.

## Features

- User registration, login, and logout with JWT-based auth
- Cookie-based token storage with blacklist support for logout invalidation
- Account creation for authenticated users
- Account listing and balance lookup
- Transaction creation between accounts with idempotency support
- System-user-only initial funds transaction endpoint
- MongoDB ledger entries for immutable debit and credit history
- Email notifications for registration and successful transfers

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Token
- bcryptjs
- cookie-parser
- multer
- nodemailer

## Project Structure

```text
server.js
src/
  app.js
  config/
    db.js
  controller/
    account.controller.js
    auth.controller.js
    transaction.controller.js
  middleware/
    auth.middleware.js
  models/
    account.model.js
    blackListModel.js
    ledger.model.js
    transaction.model.js
    user.model.js
  routes/
    account.route.js
    auth.route.js
    transaction.route.js
  services/
    email.service.js
```

## Prerequisites

- Node.js 18+ recommended
- MongoDB database accessible through a connection string
- Gmail OAuth2 credentials for sending email notifications

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root with the required variables:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_jwt_secret
EMAIL_USER=your_gmail_address
CLIENT_ID=your_google_oauth_client_id
CLIENT_SECRET=your_google_oauth_client_secret
REFRESH_TOKEN=your_google_oauth_refresh_token
```

3. Start the app:

```bash
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

The server listens on port `3000` by default.

## API Overview

Base URL: `http://localhost:3000`

### Health Check

- `GET /`

Returns a simple status message confirming the service is running.

### Auth Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

#### Register

Request body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}
```

On success, the API creates a user, signs a JWT, sets a `token` cookie, and sends a welcome email.

#### Login

Request body:

```json
{
  "email": "john@example.com",
  "password": "secret123"
}
```

On success, the API returns the user profile and a JWT, and also sets the `token` cookie.

#### Logout

Invalidates the current token by adding it to the blacklist collection and clearing the cookie.

### Account Routes

All account routes require authentication.

- `POST /api/accounts/`
- `GET /api/accounts/`
- `GET /api/accounts/balance/:accountId`

#### Create Account

Creates a new account for the logged-in user.

#### List Accounts

Returns all accounts owned by the authenticated user.

#### Get Account Balance

Returns the balance for a specific account owned by the authenticated user.

### Transaction Routes

- `POST /api/transactions/`
- `POST /api/transactions/system/initial-funds`

#### Create Transaction

Creates a transfer between two accounts.

Request body:

```json
{
  "fromAccount": "65f0...",
  "toAccount": "65f1...",
  "amount": 500,
  "idempotencyKey": "unique-request-key"
}
```

Behavior:

- Validates required fields
- Checks that both accounts exist and are active
- Uses the sender account ledger to derive available balance
- Prevents duplicate processing using `idempotencyKey`
- Creates debit and credit ledger entries in a MongoDB transaction
- Marks the transaction as completed
- Sends a transaction success email to the logged-in user

#### Initial Funds Transaction

Creates a funding transaction from a system user account.

Request body:

```json
{
  "toAccount": "65f1...",
  "amount": 1000,
  "idempotencyKey": "initial-funds-key"
}
```

This route is protected by a system-user-only middleware, so the authenticated user must have `systemUser: true` in the database.

## Data Model Notes

### User

- `email` is unique and required
- `password` is hashed with bcrypt before save
- `systemUser` is immutable and hidden from normal queries

### Account

- Linked to a user
- Supports `ACTIVE`, `FROZEN`, and `CLOSED` statuses
- Default currency is `INR`
- Includes a `getBalance()` helper that aggregates ledger entries

### Transaction

- Tracks `fromAccount`, `toAccount`, `amount`, `status`, and `idempotencyKey`
- Status values: `PENDING`, `COMPLETED`, `FAILED`, `REVERSED`

### Ledger

- Stores immutable `CREDIT` and `DEBIT` entries
- Ledger entries are protected from update and delete operations

### Token Blacklist

- Stores logged-out tokens
- Tokens expire automatically after 3 days via MongoDB TTL indexing

## Authentication

Authentication middleware accepts the token from either:

- the `token` cookie, or
- the `Authorization: Bearer <token>` header

## Email Notifications

The app sends email notifications for:

- new user registration
- successful transactions

Email sending uses Gmail OAuth2 credentials configured in `.env`.

## Operational Notes

- The transaction flow currently includes a deliberate 15-second delay inside the MongoDB session before the credit ledger entry is written.
- The project does not include automated tests yet. The `npm test` script is a placeholder.
- `node_modules/` is ignored from source control and should be installed locally with `npm install`.

## License

ISC
