import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { User, Otp, LoginAttempt, PasswordToken, LoginChallenge } from "../models/index.js";
import { sendOtp, sendEmail } from "../services/providers.js";
import { env } from "../config/env.js";
import { asyncHandler, fail, publicUser, adminUser, tokenFor } from "../utils/api.js";

const router = Router();
const staffPassword = z.string().min(12).max(128).regex(/[a-z]/,"Password must include a lowercase letter").regex(/[A-Z]/,"Password must include an uppercase letter").regex(/\d/,"Password must include a number").regex(/[^A-Za-z0-9]/,"Password must include a special character").refine(v=>!/(password|123456|qwerty|admin)/i.test(v),"Password is too common");
const hashToken = token => crypto.createHash("sha256").update(token).digest("hex");
const portalUrl = path => `${env.clientUrl.replace(/\/$/, "")}${path}`;
async function sendPasswordLink(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  await PasswordToken.deleteMany({ user: user._id });
  await PasswordToken.create({ user: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  const url = portalUrl(`/admin/staff/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, subject: "Set your Metromindz admin password", html: `<p>Hello ${user.fullName},</p><p>Use the secure link below to set or reset your password. It expires in one hour.</p><p><a href="${url}">Set password</a></p><p>If you did not request this, you can ignore this email.</p>` });
}
function loginResponse(user) { const isAdmin = user.role === "admin" || user.role === "support"; return { token: tokenFor(user), user: isAdmin ? adminUser(user) : publicUser(user) }; }

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
router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase(), role: { $in: ["admin", "support"] }, status: "active" });
  if (user) await sendPasswordLink(user).catch(() => undefined);
  res.status(202).json({ message: "If that account exists, a password setup link has been sent." });
}));
router.post("/reset-password", asyncHandler(async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20), password: staffPassword }).parse(req.body);
  const record = await PasswordToken.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!record) throw fail(400, "This password link is invalid or has expired.");
  const user = await User.findById(record.user);
  if (!user || user.status !== "active") throw fail(400, "This account is unavailable.");
  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();
  await PasswordToken.deleteMany({ user: user._id });
  res.status(204).end();
}));
router.post("/verify-2fa", asyncHandler(async (req, res) => {
  const { challengeId, code } = z.object({ challengeId: z.string().regex(/^[a-f\d]{24}$/i), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const challenge = await LoginChallenge.findById(challengeId);
  if (!challenge || challenge.expiresAt <= new Date()) throw fail(400, "This verification code has expired.");
  if (challenge.attempts >= 5) { await challenge.deleteOne(); throw fail(429, "Too many invalid verification attempts."); }
  if (!await bcrypt.compare(code, challenge.codeHash)) { challenge.attempts += 1; await challenge.save(); throw fail(400, "Invalid verification code."); }
  const user = await User.findById(challenge.user).populate("roleRef");
  await challenge.deleteOne();
  if (!user || user.status !== "active") throw fail(401, "Account is unavailable");
  user.lastLoginAt = new Date(); await user.save();
  res.json(loginResponse(user));
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
  if (user.twoFactorEnabled && (user.role === "admin" || user.role === "support")) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await LoginChallenge.deleteMany({ user: user._id });
    const challenge = await LoginChallenge.create({ user: user._id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 5 * 60_000) });
    const delivery = await sendEmail({ to: user.email, subject: "Your Metromindz verification code", html: `<p>Your verification code is <strong>${code}</strong>. It expires in 5 minutes.</p>` });
    if (!delivery.sent) { await challenge.deleteOne(); throw fail(503, "Two-factor email delivery is not configured."); }
    return res.status(202).json({ twoFactorRequired: true, challengeId: challenge.id });
  }
  user.lastLoginAt = new Date();
  await user.save();
  res.json(loginResponse(user));
}));
export default router;
