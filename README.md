# NaijaPay

A Railway-ready Node.js/Express + PostgreSQL backend for the supplied NaijaPay customer and admin HTML pages.

## Includes
- User registration/login
- JWT authentication
- Naira wallet balances
- Manual deposit requests
- Admin deposit approval/rejection
- Withdrawal requests with balance reservation
- Admin withdrawal approval/rejection
- Transaction history
- Admin dashboard
- PostgreSQL database initialization
- Railway deployment configuration

## Important production note
This project does not pretend to be a bank or payment processor. Deposits are pending until verified by an administrator. To automatically verify bank transfers, integrate a legitimate Nigerian payment/banking provider and keep its secret keys in Railway environment variables.
