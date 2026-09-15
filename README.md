# Metromindz Commerce API

Express + MongoDB backend for the storefront and admin pages in `client/`.

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

The API is prefixed with `/api/v1`. Run `npm run seed` after MongoDB is available to create an admin account (`admin@metromindz.local` / `ChangeMe123!`) and a few catalog entries; change that password immediately.

Key endpoints: `auth/request-otp`, `auth/verify-otp`, `products`, `cart`, `wishlist`, `orders/checkout`, `coupons/validate`, `reviews`, and protected `/admin/*` catalog/order/customer/configuration endpoints.

All prices and discounts are recomputed from database records during checkout. Client totals, product names, prices, and coupon discount values are never trusted.

## Provider configuration

Set the optional Twilio, Resend, and Razorpay variables in `.env` to enable SMS OTP delivery, order emails, and Razorpay payment orders/webhooks. With `OTP_DEBUG=true`, OTPs are returned only for local development. Never enable it in production.

Set `NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1` in `client/.env.local` before starting the frontend.
