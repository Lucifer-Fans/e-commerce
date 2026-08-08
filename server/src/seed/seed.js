/* eslint-disable no-console */
const mongoose = require('mongoose');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const {
  User, Category, SubCategory, Brand, Product, Banner, Coupon, Cart, Wishlist, Review, Order, Payment, Address,
} = require('../models');
const data = require('./data');

const ADMIN = { name: 'Store Admin', email: 'admin@shop.com', password: 'Admin@123', role: 'admin' };
const DEMO = { name: 'Demo Customer', email: 'customer@shop.com', password: 'Customer@123', role: 'user' };

async function destroy() {
  await Promise.all([
    Product.deleteMany({}), Category.deleteMany({}), SubCategory.deleteMany({}), Brand.deleteMany({}),
    Banner.deleteMany({}), Coupon.deleteMany({}), Cart.deleteMany({}), Wishlist.deleteMany({}),
    Review.deleteMany({}), Order.deleteMany({}), Payment.deleteMany({}), Address.deleteMany({}),
    User.deleteMany({}),
  ]);
  console.log('✔ All collections cleared');
}

async function seed() {
  await destroy();

  /* Users — created via .create() so the password hashing hook runs. */
  const admin = await User.create(ADMIN);
  const customer = await User.create({ ...DEMO, phone: '9876543210' });
  await Promise.all([
    Cart.create({ user: customer._id }),
    Wishlist.create({ user: customer._id }),
    Address.create({
      user: customer._id,
      label: 'home',
      fullName: 'Demo Customer',
      phone: '9876543210',
      addressLine1: '221B Nehru Road, Lakeview Apartments',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      isDefault: true,
    }),
  ]);
  console.log(`✔ Users seeded (admin: ${ADMIN.email} / ${ADMIN.password})`);

  /* Taxonomy */
  const categoryByName = new Map();
  const subCategoryByKey = new Map();

  for (const cat of data.categories) {
    const { subCategories, ...rest } = cat;
    const created = await Category.create(rest);
    categoryByName.set(created.name, created);

    for (const [index, subName] of subCategories.entries()) {
      const sub = await SubCategory.create({
        name: subName,
        category: created._id,
        displayOrder: index,
      });
      subCategoryByKey.set(`${created.name}::${subName}`, sub);
    }
  }
  console.log(`✔ ${categoryByName.size} categories and ${subCategoryByKey.size} sub-categories seeded`);

  /* Brands — created one by one so the slug hook runs. */
  for (const brand of data.brands) await Brand.create(brand);
  console.log(`✔ ${data.brands.length} brands seeded`);

  /* Products */
  let productCount = 0;
  for (const item of data.products) {
    const category = categoryByName.get(item.category);
    const subCategory = subCategoryByKey.get(`${item.category}::${item.subCategory}`);
    if (!category) {
      console.warn(`⚠ Skipping "${item.name}" — unknown category "${item.category}"`);
      continue;
    }

    await Product.create({
      ...item,
      category: category._id,
      subCategory: subCategory?._id,
      status: 'published',
      createdBy: admin._id,
      sku: `SKU-${String(++productCount).padStart(5, '0')}`,
      images: item.images.map((img, i) => ({ ...img, isPrimary: i === 0, displayOrder: i })),
      meta: {
        title: `${item.name} | Premium Store`,
        description: item.shortDescription,
        keywords: item.tags,
      },
    });
  }
  console.log(`✔ ${productCount} products seeded`);

  await Banner.insertMany(data.banners);
  console.log(`✔ ${data.banners.length} hero banners seeded`);

  await Coupon.insertMany(data.coupons);
  console.log(`✔ ${data.coupons.length} coupons seeded`);

  /* A few reviews so the ratings UI has real data to render. */
  const someProducts = await Product.find().limit(5);
  const samples = [
    { rating: 5, title: 'Exactly as described', comment: 'Quality matched the spec sheet. Delivery was on time and the packaging was intact.' },
    { rating: 4, title: 'Good value', comment: 'Works well for the price. Would have liked slightly faster delivery.' },
    { rating: 5, title: 'Will order again', comment: 'Second time buying this. Consistent quality across both orders.' },
  ];
  for (const [i, product] of someProducts.entries()) {
    await Review.create({
      product: product._id,
      user: customer._id,
      ...samples[i % samples.length],
      isVerifiedPurchase: true,
    });
  }
  console.log(`✔ ${someProducts.length} reviews seeded`);
}

(async () => {
  try {
    env.assertValid();
    await connectDB();

    if (process.argv.includes('--destroy')) {
      await destroy();
    } else {
      await seed();
      console.log('\n🎉 Seeding complete.');
      console.log(`   Admin    → ${ADMIN.email} / ${ADMIN.password}`);
      console.log(`   Customer → ${DEMO.email} / ${DEMO.password}\n`);
    }
  } catch (err) {
    console.error(`✖ Seeding failed: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
    await mongoose.disconnect().catch(() => {});
  }
})();
