import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/index.js";
import { asyncHandler, fail, publicUser, adminUser, tokenFor } from "../utils/api.js";

// --- DEMO MODE ---
// Fixed OTP for development/demo. Replace with real OTP generation + SMS when going live.
const DEMO_OTP = "4321";

const router = Router();

// Normalize: strip non-digits, accept 10-digit local or 12-digit with country code (e.g. 91XXXXXXXXXX)
const phoneSchema = z.string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^(\d{10}|91\d{10})$/.test(v), "Enter a valid mobile number");

router.post("/request-otp", asyncHandler(async (req, res) => {
  phoneSchema.parse(req.body.phone); // validate only, no SMS sent in demo mode
  res.status(201).json({ message: "OTP sent", debugOtp: DEMO_OTP });
}));

router.post("/verify-otp", asyncHandler(async (req, res) => {
  const { phone: value, otp } = z.object({
    phone: phoneSchema,
    otp: z.string().regex(/^\d{4}$/, "OTP must contain 4 digits"),
  }).parse(req.body);

  if (otp !== DEMO_OTP) throw fail(400, "Invalid OTP");

  const user = await User.findOneAndUpdate(
    { phone: value },
    { $setOnInsert: { phone: value, fullName: "Customer" } },
    { upsert: true, new: true }
  );
  if (user.status !== "active") throw fail(401, "Account is unavailable");
  res.json({ token: tokenFor(user), user: publicUser(user) });
}));
router.post("/login", asyncHandler(async (req, res) => { const { email, password } = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body); const user = await User.findOne({ email: email.toLowerCase() }).populate("roleRef"); if (!user?.passwordHash || !await bcrypt.compare(password, user.passwordHash)) throw fail(401, "Invalid email or password"); if (user.status !== "active") throw fail(401, "Account is unavailable"); const isAdmin = user.role === "admin" || user.role === "support"; res.json({ token: tokenFor(user), user: isAdmin ? adminUser(user) : publicUser(user) }); }));
export default router;
