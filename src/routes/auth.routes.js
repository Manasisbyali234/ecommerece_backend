import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { User, Otp, LoginAttempt } from "../models/index.js";
import { sendOtp } from "../services/providers.js";
import { asyncHandler, fail, publicUser, adminUser, tokenFor } from "../utils/api.js";

const router = Router();

// Normalize: strip non-digits, accept 10-digit local or 12-digit with country code (e.g. 91XXXXXXXXXX)
const phoneSchema = z.string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^(\d{10}|91\d{10})$/.test(v), "Enter a valid mobile number");

router.post("/request-otp", asyncHandler(async (req, res) => {
  const phone = phoneSchema.parse(req.body.phone);
  const code = String(crypto.randomInt(0, 10_000)).padStart(4, "0");
  await Otp.deleteMany({ phone });
  await Otp.create({ phone, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 5 * 60_000) });
  const delivery = await sendOtp(phone, code);
  // A code is returned only for explicitly configured local development.
  res.status(201).json({ message: "OTP sent", ...(delivery.provider === "development" ? { debugOtp: code } : {}) });
}));

router.post("/verify-otp", asyncHandler(async (req, res) => {
  const { phone: value, otp } = z.object({
    phone: phoneSchema,
    otp: z.string().regex(/^\d{4}$/, "OTP must contain 4 digits"),
  }).parse(req.body);

  const record = await Otp.findOne({ phone: value }).sort({ createdAt: -1 });
  if (!record || record.expiresAt <= new Date()) throw fail(400, "This OTP has expired. Request a new code.");
  if (record.attempts >= 5) { await record.deleteOne(); throw fail(429, "Too many invalid OTP attempts. Request a new code."); }
  if (!await bcrypt.compare(otp, record.codeHash)) { record.attempts += 1; await record.save(); throw fail(400, "Invalid OTP"); }
  await record.deleteOne();

  const user = await User.findOneAndUpdate(
    { phone: value },
    { $setOnInsert: { phone: value, fullName: "Customer" } },
    { upsert: true, new: true }
  );
  if (user.status !== "active") throw fail(401, "Account is unavailable");
  res.json({ token: tokenFor(user), user: publicUser(user) });
}));
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body);
  const normalizedEmail = email.toLowerCase();
  const ip = String(req.ip || req.socket.remoteAddress || "unknown");
  const keys = [`email:${normalizedEmail}`, `ip:${ip}`];
  const attempts = await LoginAttempt.find({ key: { $in: keys } });
  const locked = attempts.find((attempt) => attempt.lockedUntil && attempt.lockedUntil > new Date());
  if (locked) throw fail(429, "Too many failed sign-in attempts. Please try again in 30 minutes.");
  const user = await User.findOne({ email: normalizedEmail }).populate("roleRef");
  if (!user?.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
    await Promise.all(keys.map(async (key) => {
      const attempt = await LoginAttempt.findOneAndUpdate({ key }, { $inc: { failures: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      if (attempt.failures >= 3) { attempt.lockedUntil = new Date(Date.now() + 30 * 60_000); attempt.failures = 0; await attempt.save(); }
    }));
    throw fail(401, "Invalid email or password");
  }
  await LoginAttempt.deleteMany({ key: { $in: keys } });
  if (user.status !== "active") throw fail(401, "Account is unavailable");
  const isAdmin = user.role === "admin" || user.role === "support";
  res.json({ token: tokenFor(user), user: isAdmin ? adminUser(user) : publicUser(user) });
}));
export default router;
