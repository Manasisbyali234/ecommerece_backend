import crypto from "crypto";
import { env } from "../config/env.js";
import { fail } from "../utils/api.js";

export async function sendOtp(phone, code) {
  if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFrom) {
    if (env.otpDebug) return { provider: "development" };
    throw fail(503, "SMS OTP is not configured");
  }
  const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ to: `+91${phone}`, from: env.twilioFrom, body: `Your Metromindz login code is ${code}. It expires in 5 minutes.` }) });
  if (!response.ok) throw fail(502, "Unable to send OTP through SMS provider");
  return { provider: "twilio" };
}

export async function sendEmail({ to, subject, html, senderName, replyTo }) {
  if (!env.zeptomailToken || !env.emailFrom) return { sent: false, reason: "Email provider is not configured" };
  const from = { address: env.emailFrom, name: senderName || "Metromindz" };
  const body = { from, to: [{ email_address: { address: to } }], subject, htmlbody: html };
  if (replyTo) body.reply_to = [{ address: replyTo }];
  const response = await fetch("https://api.zeptomail.in/v1.1/email", { method: "POST", headers: { authorization: `Zoho-enczapikey ${env.zeptomailToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw fail(502, "Unable to send email through provider");
  return { sent: true };
}

export async function createRazorpayOrder(order) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) throw fail(503, "Razorpay is not configured");
  const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ amount: Math.round(order.total * 100), currency: "INR", receipt: order.orderNumber, notes: { internalOrderId: order.id } }) });
  if (!response.ok) throw fail(502, "Unable to create payment order");
  const payment = await response.json();
  return { provider: "razorpay", keyId: env.razorpayKeyId, orderId: payment.id, amount: payment.amount, currency: payment.currency };
}

export function verifyRazorpayWebhook(rawBody, signature) {
  if (!env.razorpayWebhookSecret) return true; // webhook secret not configured yet — skip verification
  const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
  return Boolean(signature && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)));
}

export async function verifyRazorpayCredentials({ keyId, keySecret }) {
  if (!keyId || !keySecret) throw fail(400, "Razorpay key ID and secret are required");
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/payments?count=1", { headers: { authorization: `Basic ${auth}` } });
  if (response.status === 401) throw fail(400, "Razorpay rejected these credentials");
  if (!response.ok) throw fail(502, "Unable to verify Razorpay credentials");
  return { verified: true, provider: "razorpay" };
}

async function shiprocketToken() {
  if (!env.shiprocketEmail || !env.shiprocketPassword) throw fail(503, "Shiprocket credentials are not configured");
  const response = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: env.shiprocketEmail, password: env.shiprocketPassword }) });
  if (!response.ok) throw fail(502, "Shiprocket authentication failed");
  const data = await response.json();
  if (!data.token) throw fail(502, "Shiprocket did not return an access token");
  return data.token;
}

export function createManualCarrierLabel(order, options = {}) {
  const carrier = String(options.carrier || "Manual Courier").trim();
  const tracking = String(options.tracking || `MMZ${Date.now().toString().slice(-8)}${crypto.randomBytes(2).toString("hex").toUpperCase()}`).trim();
  if (!carrier) throw fail(400, "Courier partner is required");
  if (!tracking) throw fail(400, "AWB tracking number is required");
  return { carrier, tracking, status: "label_created", labelUrl: "", raw: { provider: "manual", orderId: order.id } };
}

export async function createCarrierLabel(order, options = {}) {
  if (options.manual || env.carrierProvider !== "shiprocket") return createManualCarrierLabel(order, options);
  const token = await shiprocketToken();
  const address = order.shippingAddress;
  if (!address?.street || !address?.pincode) throw fail(400, "Order requires a complete shipping address");
  const response = await fetch("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ order_id: order.orderNumber, order_date: new Date(order.createdAt).toISOString().slice(0, 10), billing_customer_name: address.fullName, billing_address: address.street, billing_city: address.city, billing_state: address.state, billing_pincode: address.pincode, billing_country: "India", billing_email: order.customer?.email || "customer@example.invalid", billing_phone: address.phone, shipping_is_billing: true, order_items: order.items.map(item => ({ name: item.name, sku: item.sku || String(item.product), units: item.quantity, selling_price: item.unitPrice })), payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid", sub_total: order.subtotal, length: 10, breadth: 10, height: 10, weight: 0.5 }) });
  if (!response.ok) throw fail(502, "Carrier could not create the shipment");
  const data = await response.json();
  return { carrier: "Shiprocket", tracking: data?.shipment_id ? String(data.shipment_id) : "", status: "label_created", labelUrl: data?.label_url || data?.label_url || "", raw: data };
}

export async function trackCarrierShipment(tracking) {
  if (env.carrierProvider !== "shiprocket") throw fail(503, "No supported carrier integration is configured");
  const token = await shiprocketToken();
  const response = await fetch(`https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${encodeURIComponent(tracking)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw fail(502, "Carrier tracking request failed");
  return response.json();
}
