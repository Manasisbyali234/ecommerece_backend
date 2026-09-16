# Metromindz Commerce API

Express + MongoDB backend for the storefront and admin pages in `client/`.

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The API is prefixed with `/api/v1`. The default seed command creates or updates only a super-admin account; it never inserts products, coupons, content, or payment gateways:

```bash
set ADMIN_PASSWORD=use-a-strong-password
npm run seed
```

Optional variables are `ADMIN_EMAIL` (defaults to `admin@metromindz.local`), `ADMIN_NAME`, and `ADMIN_RESET_PASSWORD=true` to replace the password of an existing account. `npm run seed:demo` is retained only for local demo data and should not be used for a clean or production database.

Key endpoints: `auth/request-otp`, `auth/verify-otp`, `products`, `cart`, `wishlist`, `orders/checkout`, `coupons/validate`, `reviews`, and protected `/admin/*` catalog/order/customer/configuration endpoints.

All prices and discounts are recomputed from database records during checkout. Client totals, product names, prices, and coupon discount values are never trusted.

## Provider configuration

Set the optional Twilio, Resend, and Razorpay variables in `.env` to enable SMS OTP delivery, order emails, and Razorpay payment orders/webhooks. With `OTP_DEBUG=true`, OTPs are returned only for local development. Never enable it in production.

Set `NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1` in `client/.env.local` before starting the frontend.
