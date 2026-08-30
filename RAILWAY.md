# Railway deployment

1. Create a Railway project.
2. Add a PostgreSQL database to the project.
3. Create a service from this GitHub repository.
4. Railway should detect package.json and run `npm start`.
5. Add these variables to the web service:
   DATABASE_URL (use the PostgreSQL service's DATABASE_URL)
   JWT_SECRET
   ADMIN_EMAIL
   ADMIN_PASSWORD
   DEPOSIT_BANK_NAME
   DEPOSIT_ACCOUNT_NUMBER
   DEPOSIT_ACCOUNT_NAME
6. Deploy and open the generated Railway domain.
7. Customer site: /
8. Admin site: /admin.html

Important:
- The deposit flow in this starter is manual verification. It does NOT automatically confirm bank transfers.
- Withdrawals are recorded and require admin review; actual bank payouts require a payment/banking provider integration.
- Never commit .env or real secrets to GitHub.
