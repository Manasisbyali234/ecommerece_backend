import { Content, Coupon, Order, Product } from "../models/index.js";
import { fail } from "../utils/api.js";

const SHIPPING = 50, TAX_RATE = 0.08;

function normalizeTier(item) {
  return { id: item.id, active: item.active, title: item.title, ...(item.data || {}) };
}

function isAllCategory(value) {
  return !value || ["all", "all categories"].includes(String(value).trim().toLowerCase());
}

function isAllSubCategory(value) {
  return !value || ["all", "all subcategories"].includes(String(value).trim().toLowerCase());
}

function benefitApplies(product, benefit) {
  const categoryMatches = isAllCategory(benefit.category) || product.category === benefit.category;
  const subCategoryMatches = isAllSubCategory(benefit.subCategory) || product.subCategory === benefit.subCategory;
  return categoryMatches && subCategoryMatches;
}

async function customerTier(userId) {
  if (!userId) return { tier: null, lifetimeSpend: 0, completedOrders: 0 };
  const [tierDocs, stats] = await Promise.all([
    Content.find({ type: "customer-tiers", active: true }),
    Order.aggregate([
      { $match: { user: userId, status: "delivered" } },
      { $group: { _id: null, lifetimeSpend: { $sum: "$total" }, completedOrders: { $sum: 1 } } },
    ]),
  ]);
  const lifetimeSpend = Number(stats[0]?.lifetimeSpend || 0);
  const completedOrders = Number(stats[0]?.completedOrders || 0);
  const tier = tierDocs
    .map(normalizeTier)
    .filter((t) => completedOrders >= Number(t.minOrders || 0) && lifetimeSpend >= Number(t.minTotalSpent || 0))
    .sort((a, b) => (Number(b.minTotalSpent || 0) - Number(a.minTotalSpent || 0)) || (Number(b.minOrders || 0) - Number(a.minOrders || 0)))[0] || null;
  return { tier, lifetimeSpend, completedOrders };
}

function tierDiscountForLines(lines, tier) {
  if (!tier) return 0;
  return lines.reduce((sum, line) => {
    const percent = (tier.categoryBenefits || []).reduce((max, benefit) => benefitApplies(line.product, benefit) ? Math.max(max, Number(benefit.discountPercent || 0)) : max, 0);
    return sum + (line.total * percent / 100);
  }, 0);
}

export async function priceCart(items, couponCode, options = {}) {
  if (!items?.length) throw fail(400, "Your shopping cart is empty");
  const ids = items.map((i) => i.product.toString());
  const products = await Product.find({ _id: { $in: ids }, status: "active" });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const lines = items.map((item) => {
    const p = productMap.get(item.product.toString());
    if (!p) throw fail(400, "One or more products are no longer available");
    if (item.quantity > p.stock) throw fail(400, `${p.name} has only ${p.stock} item(s) available`);
    return { product: p, quantity: item.quantity, color: item.color, size: item.size, total: p.price * item.quantity };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  let discount = 0, shippingDiscount = 0, coupon;
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
    if (!coupon || !coupon.active || coupon.expires < new Date() || coupon.used >= coupon.usageLimit) throw fail(400, "This coupon cannot be applied");
    if (subtotal < coupon.minSpend) throw fail(400, `Minimum spend of Rs ${coupon.minSpend.toFixed(2)} required`);
    const eligible = coupon.category === "All" ? lines : lines.filter((l) => l.product.category === coupon.category);
    if (!eligible.length) throw fail(400, `Requires a ${coupon.category} item in cart`);
    const eligibleSubtotal = eligible.reduce((s, l) => s + l.total, 0);
    if (coupon.type === "percentage") discount = eligibleSubtotal * coupon.value / 100;
    if (coupon.type === "fixed") discount = Math.min(coupon.value, eligibleSubtotal);
    if (coupon.type === "free_shipping") shippingDiscount = SHIPPING;
    if (coupon.type === "bogo") {
      const units = eligible.flatMap((l) => Array(l.quantity).fill(l.product.price)).sort((a, b) => a - b);
      discount = units.slice(0, Math.floor(units.length / 2)).reduce((s, p) => s + p, 0);
      if (!discount) throw fail(400, "Add another eligible item to unlock BOGO");
    }
  }
  const tierStatus = await customerTier(options.userId);
  const tierDiscount = Number(tierDiscountForLines(lines, tierStatus.tier).toFixed(2));
  const tierShippingDiscount = tierStatus.tier?.freeShipping ? SHIPPING : 0;
  const shipping = Math.max(0, SHIPPING - Math.max(shippingDiscount, tierShippingDiscount));
  const taxable = Math.max(0, subtotal - discount - tierDiscount);
  const tax = Number((taxable * TAX_RATE).toFixed(2));
  return {
    lines,
    subtotal,
    discount: Number(discount.toFixed(2)),
    tierDiscount,
    shipping,
    tax,
    total: Number((taxable + shipping + tax).toFixed(2)),
    coupon,
    tier: tierStatus.tier,
    tierStatus,
  };
}
