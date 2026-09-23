import { Router } from "express";
import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Product, Coupon, Order, Review, User, Role, Setting, Content, Invoice, PaymentGateway } from "../models/index.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import { asyncHandler, fail, adminUser } from "../utils/api.js";
import { sendEmail, verifyRazorpayCredentials, createCarrierLabel, trackCarrierShipment } from "../services/providers.js";
import { sendOutForDeliveryEmail, sendDeliveredEmail } from "../services/notifications.js";
import { uploadR2Image, deleteR2Image } from "../services/r2.js";
import { env } from "../config/env.js";

function adminWelcomeEmail({fullName,email,password,role,loginUrl}){
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Metromindz</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:40px 48px;text-align:center">
    <div style="display:inline-block;background:#f59e0b;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;margin-bottom:16px">&#9679;</div>
    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px">Metromindz</h1>
    <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;letter-spacing:1px;text-transform:uppercase">Admin Portal Access</p>
  </td></tr>
  <!-- Welcome Banner -->
  <tr><td style="background:#f59e0b;padding:18px 48px;text-align:center">
    <p style="margin:0;color:#1a1a2e;font-size:15px;font-weight:700">&#127881; Your admin account has been created successfully!</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:40px 48px">
    <p style="margin:0 0 8px;color:#374151;font-size:16px">Hi <strong>${fullName}</strong>,</p>
    <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6">Welcome to the Metromindz team! Your administrator account has been set up. Below are your login credentials &mdash; please keep them secure and change <a href="${loginUrl}" style="color:#f59e0b;font-weight:600;text-decoration:underline">here</a> your password after your first login.</p>
    <!-- Credentials Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:28px">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Portal URL</p>
        <a href="${loginUrl}" style="color:#f59e0b;font-size:14px;font-weight:600;text-decoration:none">${loginUrl}</a>
      </td></tr>
      <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Email Address</p>
        <p style="margin:0;color:#1e293b;font-size:14px;font-weight:600;font-family:monospace">${email}</p>
      </td></tr>
      <tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Temporary Password</p>
        <p style="margin:0;color:#1e293b;font-size:16px;font-weight:800;font-family:monospace;background:#fff7ed;border:1px dashed #f59e0b;border-radius:6px;padding:8px 12px;display:inline-block;letter-spacing:2px">${password}</p>
      </td></tr>
      <tr><td style="padding:20px 24px">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Assigned Role</p>
        <span style="background:#f59e0b;color:#1a1a2e;font-size:12px;font-weight:800;padding:4px 12px;border-radius:20px">${role}</span>
      </td></tr>
    </table>
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:28px">
      <a href="${loginUrl}" style="display:inline-block;background:#f59e0b;color:#1a1a2e;font-size:15px;font-weight:800;padding:14px 40px;border-radius:8px;text-decoration:none;letter-spacing:0.3px">Login to Admin Dashboard &rarr;</a>
    </td></tr></table>
    <!-- Security Notice -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px"><tr><td style="padding:16px 20px">
      <p style="margin:0 0 4px;color:#92400e;font-size:12px;font-weight:800">&#9888; Security Reminder</p>
      <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5">Please change your password immediately after your first login. Never share your credentials with anyone. If you did not expect this email, contact your system administrator right away.</p>
    </td></tr></table>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 48px;text-align:center">
    <p style="margin:0 0 4px;color:#94a3b8;font-size:12px">&copy; ${new Date().getFullYear()} Metromindz. All rights reserved.</p>
    <p style="margin:0;color:#cbd5e1;font-size:11px">This is an automated message. Please do not reply to this email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const router = Router();
router.use(requireAuth, requireRole("admin", "support"));

router.put("/uploads/:folder", express.raw({type:"image/*",limit:"10mb"}), asyncHandler(async(req,res)=>{
  const image = await uploadR2Image({folder:req.params.folder,fileName:req.headers["x-file-name"],contentType:req.headers["content-type"],body:req.body});
  res.status(201).json({image});
}));
router.delete("/uploads/favicon", asyncHandler(async(req,res)=>{
  const key = z.object({key:z.string().min(1)}).parse(req.body).key;
  await deleteR2Image(key); res.status(204).end();
}));

const csvValue = value => `"${String(value ?? "").replace(/"/g,'""')}"`;
function sendCsv(res, filename, headers, rows) {
  res.type("text/csv").attachment(filename).send([headers.map(csvValue).join(","),...rows.map(row=>row.map(csvValue).join(","))].join("\n"));
}
function invoicePdf(invoice, order) {
  const esc=v=>String(v??"").replace(/([\\\(\)])/g,"\\$1").replace(/[\r\n]/g," ");
  const lines=["Metromindz Tax Invoice",`Invoice: ${invoice.invoiceNumber}`,`Order: ${order?.orderNumber||"-"}`,`Customer: ${order?.customer?.fullName||"-"}`,`Issued: ${new Date(invoice.issuedAt).toLocaleDateString("en-IN")}`,`Status: ${invoice.status}`,`Amount: INR ${Number(invoice.amount||0).toFixed(2)}`];
  const content=lines.map((line,i)=>`BT /F1 ${i===0?18:11} Tf 50 ${790-i*28} Td (${esc(line)}) Tj ET`).join("\n");
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let pdf="%PDF-1.4\n", offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const start=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,"0")+" 00000 n ").join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}

const productBody = z.object({name:z.string().trim().min(2).max(180),slug:z.string().trim().min(2).max(180).regex(/^[a-z0-9-]+$/),sku:z.string().trim().min(2).max(60),category:z.string().trim().min(2).max(80),subCategory:z.string().trim().max(80).optional(),brand:z.string().trim().max(80).optional(),gender:z.enum(["Men","Women","Unisex","Kids"]).optional(),price:z.number().nonnegative(),costPrice:z.number().nonnegative().optional(),discountPercent:z.number().min(0).max(100).optional(),originalPrice:z.number().nonnegative().optional(),stock:z.number().int().nonnegative(),status:z.enum(["active","draft","archived"]),image:z.string().url(),images:z.array(z.string().url()).max(12).default([]),description:z.string().max(5000).optional(),features:z.array(z.string().max(250)).max(30).default([]),specs:z.record(z.string().max(150),z.string().max(500)).default({}),colors:z.array(z.object({name:z.string().max(40),hex:z.string().regex(/^#[0-9A-Fa-f]{6}$/)})).max(20).default([]),sizes:z.array(z.string().max(30)).max(30).default([]),tags:z.array(z.string().max(40)).max(30).default([]),codAvailable:z.boolean().default(true),returnAvailable:z.boolean().default(true),exchangeAvailable:z.boolean().default(true),warrantyPeriod:z.string().max(100).optional(),aboutSections:z.array(z.record(z.string(),z.unknown())).max(30).default([]),additionalInfoSections:z.array(z.record(z.string(),z.unknown())).max(30).default([]),comboDealAvailable:z.boolean().optional(),comboDeals:z.array(z.object({id:z.string().optional(),title:z.string().max(120).optional(),productIds:z.array(z.string()).max(5).default([]),discountPercent:z.number().min(0).max(100).optional()})).max(10).optional(),comboProductIds:z.array(z.string()).max(10).optional()});

router.get("/dashboard", requirePermission("dashboard:read"), asyncHandler(async(_req,res)=>{
  const [products,orders,customers,pendingReviews,revenue]=await Promise.all([Product.countDocuments(),Order.countDocuments(),User.countDocuments({role:"customer"}),Review.countDocuments({status:"pending"}),Order.aggregate([{$match:{paymentStatus:"paid"}},{$group:{_id:null,total:{$sum:"$total"}}}])]);
  res.json({products,orders,customers,pendingReviews,revenue:revenue[0]?.total||0});
}));

router.get("/products", requirePermission("products:read"), asyncHandler(async(req,res)=>{
  // Product-list loading must remain resilient to harmless proxy/UI query
  // parameters. A bad or repeated `status` used to turn the whole catalog
  // request into a 422 response.
  const rawStatus=Array.isArray(req.query.status)?req.query.status[0]:req.query.status;
  const status=["active","draft","archived"].includes(rawStatus)?rawStatus:undefined;
  res.json({items:await Product.find(status?{status}:{}).sort({createdAt:-1})});
}));
router.post("/products", requirePermission("products:create"), asyncHandler(async(req,res)=>{
  const data=productBody.parse(req.body);
  const product=await Product.create(data);
  res.status(201).json({product});
}));
router.patch("/products/:id", requirePermission("products:update"), asyncHandler(async(req,res)=>{
  const data=productBody.partial().parse(req.body);
  const existing=await Product.findById(req.params.id);
  if(!existing)throw fail(404,"Product not found");
  const r2Base=(env.r2PublicUrl||"").replace(/\/$/,"");
  const extractKey=url=>url&&typeof url==="string"&&r2Base&&url.startsWith(r2Base+"/")?url.slice(r2Base.length+1):null;
  const oldImages=[existing.image,...(existing.images||[])].filter(Boolean);
  const newImages=[data.image,...(data.images||[])].filter(Boolean);
  const removed=oldImages.filter(u=>!newImages.includes(u));
  await Promise.all(removed.map(u=>{const k=extractKey(u);return k?deleteR2Image(k).catch(()=>{}):Promise.resolve();}));
  const product=await Product.findByIdAndUpdate(req.params.id,data,{new:true,runValidators:true});
  res.json({product});
}));
router.delete("/products/:id", requirePermission("products:delete"), asyncHandler(async(req,res)=>{
  const product=await Product.findByIdAndDelete(req.params.id);
  if(!product)throw fail(404,"Product not found");
  const r2Base=(env.r2PublicUrl||"").replace(/\/$/,"");
  const extractKey=url=>url&&typeof url==="string"&&r2Base&&url.startsWith(r2Base+"/")?url.slice(r2Base.length+1):null;
  const allImages=[product.image,...(product.images||[])].filter(Boolean);
  await Promise.all(allImages.map(u=>{const k=extractKey(u);return k?deleteR2Image(k).catch(()=>{}):Promise.resolve();}));
  res.status(204).end();
}));

const couponBody=z.object({code:z.string().trim().min(3).max(30).transform(v=>v.toUpperCase()),description:z.string().max(500).optional(),type:z.enum(["percentage","fixed","bogo","free_shipping"]),value:z.number().nonnegative().default(0),minSpend:z.number().nonnegative().default(0),category:z.string().min(1).max(80).default("All"),usageLimit:z.number().int().min(1),expires:z.coerce.date(),active:z.boolean().default(true)});
router.get("/coupons", asyncHandler(async(_req,res)=>res.json({items:await Coupon.find().sort({createdAt:-1})})));
router.post("/coupons", asyncHandler(async(req,res)=>res.status(201).json({coupon:await Coupon.create(couponBody.parse(req.body))})));
router.patch("/coupons/:id", asyncHandler(async(req,res)=>{const coupon=await Coupon.findByIdAndUpdate(req.params.id,couponBody.partial().parse(req.body),{new:true,runValidators:true});if(!coupon)throw fail(404,"Coupon not found");res.json({coupon});}));
router.delete("/coupons/:id", asyncHandler(async(req,res)=>{if(!await Coupon.findByIdAndDelete(req.params.id))throw fail(404,"Coupon not found");res.status(204).end();}));

router.get("/orders", requirePermission("orders:read"), asyncHandler(async(req,res)=>{
  const status=z.enum(["pending","processing","shipped","delivered","cancelled"]).optional().parse(req.query.status);
  res.json({items:await Order.find(status?{status}:{}).populate("user","fullName email phone").sort({createdAt:-1})});
}));
router.patch("/orders/:id", requirePermission("orders:update"), asyncHandler(async(req,res)=>{
  const data=z.object({status:z.enum(["pending","processing","shipped","delivered","cancelled"]).optional(),paymentStatus:z.enum(["paid","unpaid","refunded"]).optional(),shipment:z.object({carrier:z.string().min(2).max(80),tracking:z.string().min(2).max(100),status:z.enum(["label_created","in_transit","out_for_delivery","delivered","returned"]),eta:z.coerce.date().optional()}).optional()}).parse(req.body);
  const order=await Order.findByIdAndUpdate(req.params.id,data,{new:true,runValidators:true});
  if(!order)throw fail(404,"Order not found");
  const customerEmail=order.customer?.email;
  if(customerEmail){
    if(data.status==="shipped")sendOutForDeliveryEmail(order,customerEmail).catch(()=>{});
    else if(data.status==="delivered")sendDeliveredEmail(order,customerEmail).catch(()=>{});
  }
  res.json({order});
}));

router.get("/customers", requirePermission("customers:read"), asyncHandler(async(_req,res)=>res.json({items:await User.find({role:"customer"}).select("fullName email phone status profile addresses createdAt").sort({createdAt:-1})})));
router.patch("/customers/:id/status", asyncHandler(async(req,res)=>{const {status}=z.object({status:z.enum(["active","disabled"])}).parse(req.body);const user=await User.findOneAndUpdate({_id:req.params.id,role:"customer"},{status},{new:true});if(!user)throw fail(404,"Customer not found");res.json({user});}));
const customerBody=z.object({fullName:z.string().trim().min(2).max(100),email:z.string().email().optional(),phone:z.string().regex(/^\d{10}$/).optional(),status:z.enum(["active","disabled"]).optional(),profile:z.object({altPhone:z.string().optional(),gender:z.string().optional(),dob:z.string().optional()}).optional()});
router.post("/customers", asyncHandler(async(req,res)=>{const data=customerBody.parse(req.body);if(!data.email&&!data.phone)throw fail(400,"Customer email or phone is required");const user=await User.create({...data,email:data.email?.toLowerCase(),role:"customer"});res.status(201).json({user});}));
router.patch("/customers/:id", asyncHandler(async(req,res)=>{const user=await User.findOneAndUpdate({_id:req.params.id,role:"customer"},customerBody.partial().parse(req.body),{new:true,runValidators:true});if(!user)throw fail(404,"Customer not found");res.json({user});}));

router.get("/users", requireRole("admin"), requirePermission("users:read"), asyncHandler(async(_req,res)=>{
  const users=await User.find({role:{$in:["admin","support"]}}).populate("roleRef").sort({createdAt:-1});
  res.json({items:users.map(adminUser)});
}));
router.post("/users", requireRole("admin"), requirePermission("users:create"), asyncHandler(async(req,res)=>{
  const data=z.object({fullName:z.string().trim().min(2).max(100),email:z.string().email(),password:z.string().min(8).max(128).regex(/(?=.*[A-Z])(?=.*\d)/,"Password must include an uppercase letter and a number"),roleId:z.string().regex(/^[a-f\d]{24}$/i,"Invalid role id").optional(),role:z.enum(["admin","support"]).default("admin")}).parse(req.body);
  const existing=await User.findOne({email:data.email.toLowerCase()});
  if(existing)throw fail(409,"An account with this email already exists");
  const roleDoc=data.roleId?await Role.findById(data.roleId):null;
  if(data.roleId&&!roleDoc)throw fail(404,"Role not found");
  if(roleDoc?.isSuperAdmin&&await User.exists({roleRef:roleDoc._id}))throw fail(409,"A Super Admin account already exists");
  const user=await User.create({fullName:data.fullName,email:data.email.toLowerCase(),passwordHash:await bcrypt.hash(data.password,12),role:data.role,roleRef:roleDoc?._id||null});
  await user.populate("roleRef");
  // Send welcome email with credentials
  const roleName=roleDoc?.name||(data.role==="admin"?"Administrator":"Support");
  await sendEmail({
    to:data.email,
    subject:"Welcome to Metromindz Admin — Your Account is Ready",
    html:adminWelcomeEmail({fullName:data.fullName,email:data.email,password:data.password,role:roleName,loginUrl:`${env.clientUrl}/admin/staff/login`})
  }).catch(()=>{});
  res.status(201).json({user:adminUser(user)});
}));
router.patch("/users/:id", requireRole("admin"), requirePermission("users:update"), asyncHandler(async(req,res)=>{
  const data=z.object({fullName:z.string().trim().min(2).max(100).optional(),role:z.enum(["admin","support"]).optional(),roleId:z.string().regex(/^[a-f\d]{24}$/i,"Invalid role id").optional(),status:z.enum(["active","disabled"]).optional(),password:z.string().min(8).max(128).regex(/(?=.*[A-Z])(?=.*\d)/,"Password must include an uppercase letter and a number").optional()}).parse(req.body);
  const patch={};
  if(data.fullName)patch.fullName=data.fullName;
  if(data.role)patch.role=data.role;
  if(data.status)patch.status=data.status;
  if(data.roleId){const roleDoc=await Role.findById(data.roleId);if(!roleDoc)throw fail(404,"Role not found");const current=await User.findById(req.params.id);if(roleDoc.isSuperAdmin&&current?.roleRef?.toString()!==roleDoc.id&&await User.exists({roleRef:roleDoc._id}))throw fail(409,"A Super Admin account already exists");patch.roleRef=roleDoc._id;}
  if(data.password)patch.passwordHash=await bcrypt.hash(data.password,12);
  const user=await User.findOneAndUpdate({_id:req.params.id,role:{$in:["admin","support"]}},patch,{new:true,runValidators:true}).populate("roleRef");
  if(!user)throw fail(404,"Admin user not found");
  res.json({user:adminUser(user)});
}));
router.delete("/users/:id", requireRole("admin"), requirePermission("users:delete"), asyncHandler(async(req,res)=>{
  if(req.params.id===req.user.id)throw fail(400,"You cannot delete your own account");
  const candidate=await User.findOne({_id:req.params.id,role:{$in:["admin","support"]}}).populate("roleRef");
  if(candidate?.roleRef?.isSuperAdmin)throw fail(400,"The Super Admin account cannot be deleted");
  const user=candidate&&await User.findByIdAndDelete(candidate._id);
  if(!user)throw fail(404,"Admin user not found");
  res.status(204).end();
}));

const roleBody=z.object({name:z.string().trim().min(2).max(80),description:z.string().max(500).default(""),isSuperAdmin:z.boolean().default(false),permissions:z.array(z.string().trim().min(1).max(100)).max(200).default([])});
router.get("/roles", requireRole("admin"), requirePermission("users:read"), asyncHandler(async(_req,res)=>res.json({items:await Role.find().sort({isSuperAdmin:-1,name:1})})));
router.post("/roles", requireRole("admin"), requirePermission("users:create"), asyncHandler(async(req,res)=>res.status(201).json({role:await Role.create(roleBody.parse(req.body))})));
router.patch("/roles/:id", requireRole("admin"), requirePermission("users:update"), asyncHandler(async(req,res)=>{
  const role=await Role.findByIdAndUpdate(req.params.id,roleBody.partial().parse(req.body),{new:true,runValidators:true});
  if(!role)throw fail(404,"Role not found");
  res.json({role});
}));
router.delete("/roles/:id", requireRole("admin"), requirePermission("users:delete"), asyncHandler(async(req,res)=>{
  const role=await Role.findById(req.params.id);
  if(!role)throw fail(404,"Role not found");
  if(role.isSuperAdmin)throw fail(400,"The super admin role cannot be deleted");
  await role.deleteOne();
  res.status(204).end();
}));

router.get("/reviews", asyncHandler(async(req,res)=>{const status=z.enum(["pending","approved","rejected"]).optional().parse(req.query.status);res.json({items:await Review.find(status?{status}:{}).populate("product","name image").sort({createdAt:-1})});}));
router.patch("/reviews/:id", asyncHandler(async(req,res)=>{
  const {status}=z.object({status:z.enum(["pending","approved","rejected"])}).parse(req.body);
  const review=await Review.findByIdAndUpdate(req.params.id,{status},{new:true});
  if(!review)throw fail(404,"Review not found");
  const stats=await Review.aggregate([{$match:{product:review.product,status:"approved"}},{$group:{_id:"$product",rating:{$avg:"$rating"},reviewCount:{$sum:1}}}]);
  if(stats[0])await Product.findByIdAndUpdate(review.product,{rating:Number(stats[0].rating.toFixed(1)),reviewCount:stats[0].reviewCount});
  else await Product.findByIdAndUpdate(review.product,{rating:0,reviewCount:0});
  res.json({review});
}));

router.get("/settings/:key", asyncHandler(async(req,res)=>res.json({setting:await Setting.findOne({key:req.params.key})||{key:req.params.key,value:{}}})));
router.put("/settings/:key", asyncHandler(async(req,res)=>{const value=z.record(z.string(),z.any()).parse(req.body);const setting=await Setting.findOneAndUpdate({key:req.params.key},{value},{upsert:true,new:true});res.json({setting});}));

const contentTypes=["categories","sub-categories","brands","banners","nav-categories","sidebar-options","customer-tiers","pages"];
const contentBody=z.object({slug:z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/i),title:z.string().trim().min(1).max(180),active:z.boolean().default(true),sortOrder:z.number().int().min(0).default(0),data:z.record(z.string(),z.any()).default({})});
function contentType(req){if(!contentTypes.includes(req.params.type))throw fail(404,"Unknown content type");return req.params.type;}
router.get("/content/:type", asyncHandler(async(req,res)=>{const type=contentType(req);res.json({items:await Content.find({type}).sort({sortOrder:1,createdAt:-1})});}));
router.post("/content/:type", asyncHandler(async(req,res)=>{const type=contentType(req);const item=await Content.create({...contentBody.parse(req.body),type});res.status(201).json({item});}));
router.patch("/content/:type/:id", asyncHandler(async(req,res)=>{const type=contentType(req);const item=await Content.findOneAndUpdate({_id:req.params.id,type},contentBody.partial().parse(req.body),{new:true,runValidators:true});if(!item)throw fail(404,"Content item not found");res.json({item});}));
router.delete("/content/:type/:id", asyncHandler(async(req,res)=>{
  const type=contentType(req);
  const item=await Content.findOneAndDelete({_id:req.params.id,type});
  if(!item)throw fail(404,"Content item not found");
  if(type==="sub-categories"||type==="categories"||type==="brands"){
    const imageUrl=item.data?.image||item.data?.logo;
    if(imageUrl&&typeof imageUrl==="string"&&imageUrl.startsWith((env.r2PublicUrl||"").replace(/\/$/,""))){
      const key=imageUrl.replace((env.r2PublicUrl||"").replace(/\/$/,"")+"/","");
      await deleteR2Image(key).catch(()=>{});
    }
  }
  res.status(204).end();
}));

router.get("/invoices", asyncHandler(async(_req,res)=>res.json({items:await Invoice.find().populate("order").sort({createdAt:-1})})));
router.post("/orders/:id/invoice", asyncHandler(async(req,res)=>{
  const order=await Order.findById(req.params.id);
  if(!order)throw fail(404,"Order not found");
  let invoice=await Invoice.findOne({order:order._id});
  if(!invoice){const seq=String(Date.now()).slice(-7);invoice=await Invoice.create({invoiceNumber:`INV-${new Date().getFullYear()}-${seq}`,order:order._id,customer:order.user,amount:order.total,status:order.paymentStatus==="paid"?"paid":"pending",dueAt:new Date(Date.now()+14*86400000)});}
  res.status(201).json({invoice});
}));
router.patch("/invoices/:id", asyncHandler(async(req,res)=>{const patch=z.object({status:z.enum(["paid","pending","overdue","void"]),emailedAt:z.coerce.date().optional()}).partial().parse(req.body);const invoice=await Invoice.findByIdAndUpdate(req.params.id,patch,{new:true});if(!invoice)throw fail(404,"Invoice not found");res.json({invoice});}));
router.get("/invoices/:id/pdf", asyncHandler(async(req,res)=>{const invoice=await Invoice.findById(req.params.id).populate("order");if(!invoice)throw fail(404,"Invoice not found");res.type("application/pdf").attachment(`${invoice.invoiceNumber}.pdf`).send(invoicePdf(invoice,invoice.order));}));
router.post("/invoices/:id/email", asyncHandler(async(req,res)=>{
  const invoice=await Invoice.findById(req.params.id).populate({path:"order",populate:{path:"user",select:"email"}});
  if(!invoice)throw fail(404,"Invoice not found");
  const {to:bodyEmail}=z.object({to:z.string().email().optional()}).parse(req.body||{});
  const email=bodyEmail||invoice.order?.customer?.email||invoice.order?.user?.email||(await User.findById(invoice.customer).select("email").lean())?.email;
  if(!email)throw fail(400,"This invoice has no customer email address");
  const result=await sendEmail({to:email,subject:`Your invoice ${invoice.invoiceNumber}`,html:`<h1>Metromindz invoice</h1><p>Invoice <strong>${invoice.invoiceNumber}</strong> for order ${invoice.order?.orderNumber||""} is attached in your account.</p><p>Amount: INR ${Number(invoice.amount).toFixed(2)}</p>`});
  if(!result.sent)throw fail(503,result.reason);
  invoice.emailedAt=new Date();await invoice.save();
  res.json({invoice,emailed:true});
}));

router.get("/exports/:resource.csv", asyncHandler(async(req,res)=>{
  const resource=req.params.resource;
  if(resource==="orders"){const items=await Order.find().sort({createdAt:-1});return sendCsv(res,"orders.csv",["Order","Customer","Email","Total","Status","Payment status","Created"],items.map(o=>[o.orderNumber,o.customer?.fullName,o.customer?.email,o.total,o.status,o.paymentStatus,o.createdAt]));}
  if(resource==="customers"){const items=await User.find({role:"customer"}).sort({createdAt:-1});return sendCsv(res,"customers.csv",["Name","Email","Phone","Status","Created"],items.map(u=>[u.fullName,u.email,u.phone,u.status,u.createdAt]));}
  if(resource==="invoices"){const items=await Invoice.find().populate("order").sort({createdAt:-1});return sendCsv(res,"invoices.csv",["Invoice","Order","Amount","Status","Issued","Emailed"],items.map(i=>[i.invoiceNumber,i.order?.orderNumber,i.amount,i.status,i.issuedAt,i.emailedAt]));}
  if(resource==="reviews"){const items=await Review.find().populate("product","name").sort({createdAt:-1});return sendCsv(res,"reviews.csv",["Product","Author","Rating","Status","Created"],items.map(r=>[r.product?.name,r.author,r.rating,r.status,r.createdAt]));}
  throw fail(404,"Unknown export resource");
}));

router.get("/payment-gateways", asyncHandler(async(_req,res)=>{
  const items = await PaymentGateway.find();
  res.json({items: items.map(g => { const obj = g.toJSON(); const cfg = obj.config || {}; const safe = { keyId: cfg.keyId||cfg.publishableKey ? "configured" : "", publishableKey: cfg.publishableKey||cfg.keyId||"" }; obj.config = safe; return obj; })});
}));
router.post("/payment-gateways", asyncHandler(async(req,res)=>{const data=z.object({name:z.string().min(2).max(100),provider:z.string().min(2).max(60),enabled:z.boolean().default(false),mode:z.enum(["test","live"]).default("test"),fees:z.string().max(100).optional(),config:z.record(z.string(),z.any()).default({})}).parse(req.body);res.status(201).json({gateway:await PaymentGateway.create(data)});}));
router.patch("/payment-gateways/:id", asyncHandler(async(req,res)=>{const gateway=await PaymentGateway.findByIdAndUpdate(req.params.id,z.object({name:z.string().min(2).max(100),enabled:z.boolean(),mode:z.enum(["test","live"]),fees:z.string().max(100).optional(),config:z.record(z.string(),z.any()).optional()}).partial().parse(req.body),{new:true,runValidators:true});if(!gateway)throw fail(404,"Payment gateway not found");res.json({gateway});}));
router.post("/payment-gateways/:id/verify", requireRole("admin"), asyncHandler(async(req,res)=>{
  const gateway=await PaymentGateway.findById(req.params.id);
  if(!gateway)throw fail(404,"Payment gateway not found");
  if(gateway.provider.toLowerCase()!=="razorpay")throw fail(501,"Credential verification is currently available for Razorpay only");
  const input=z.object({keyId:z.string().optional(),keySecret:z.string().optional(),publishableKey:z.string().optional(),secretKey:z.string().optional()}).parse(req.body||{});
  const result=await verifyRazorpayCredentials({keyId:input.keyId||input.publishableKey||gateway.config?.keyId||gateway.config?.publishableKey,keySecret:input.keySecret||input.secretKey||gateway.config?.keySecret||gateway.config?.secretKey});
  res.json(result);
}));

router.post("/orders/:id/shipment/label", asyncHandler(async(req,res)=>{
  const input=z.object({carrier:z.string().trim().min(2).max(80).optional(),tracking:z.string().trim().min(2).max(100).optional(),manual:z.boolean().optional()}).parse(req.body||{});
  const order=await Order.findById(req.params.id);
  if(!order)throw fail(404,"Order not found");
  const label=await createCarrierLabel(order,input);
  order.shipment={carrier:label.carrier,tracking:label.tracking,status:label.status};
  await order.save();
  res.json({order,label});
}));
router.get("/orders/:id/shipment/track", asyncHandler(async(req,res)=>{
  const order=await Order.findById(req.params.id);
  if(!order)throw fail(404,"Order not found");
  if(!order.shipment?.tracking)throw fail(400,"This order has no carrier tracking number");
  const tracking=await trackCarrierShipment(order.shipment.tracking);
  res.json({tracking});
}));

router.get("/analytics", asyncHandler(async(req,res)=>{
  const since=new Date(Date.now()-30*86400000);
  const [sales,orderCount,customers,topProducts]=await Promise.all([
    Order.aggregate([{$match:{createdAt:{$gte:since},paymentStatus:"paid"}},{$group:{_id:null,revenue:{$sum:"$total"},averageOrderValue:{$avg:"$total"}}}]),
    Order.countDocuments({createdAt:{$gte:since}}),
    User.countDocuments({role:"customer",createdAt:{$gte:since}}),
    Order.aggregate([{$unwind:"$items"},{$match:{createdAt:{$gte:since}}},{$group:{_id:"$items.product",name:{$first:"$items.name"},quantity:{$sum:"$items.quantity"},revenue:{$sum:{$multiply:["$items.quantity","$items.unitPrice"]}}}},{$sort:{revenue:-1}},{$limit:10}])
  ]);
  res.json({period:"30d",revenue:sales[0]?.revenue||0,averageOrderValue:sales[0]?.averageOrderValue||0,orderCount,newCustomers:customers,topProducts});
}));

export default router;
