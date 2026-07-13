'use strict';

const crypto = require('crypto');
const fs = require('fs');

function readJsonArray(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, rows) {
  if (!filePath) return;
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function cleanPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function customerStatus(customer) {
  return String(customer.status || 'active').toLowerCase();
}

function safeCustomer(customer = {}) {
  return {
    id: customer.id,
    fullName: customer.fullName || '',
    email: customer.email || '',
    mobile: customer.mobile || '',
    referralCode: customer.referralCode || '',
    status: customerStatus(customer),
    createdAt: customer.createdAt || null,
    updatedAt: customer.updatedAt || null,
    lastLoginAt: customer.lastLoginAt || null,
    adminNotes: customer.adminNotes || '',
  };
}

function orderId(order = {}) {
  return order.localOrderId || order.token || order.razorpayOrderId || '';
}

function safeOrder(order = {}) {
  return {
    id: orderId(order),
    localOrderId: order.localOrderId || '',
    token: order.token || '',
    trackingToken: order.trackingToken || '',
    razorpayOrderId: order.razorpayOrderId || '',
    paymentId: order.paymentId || '',
    paymentStatus: order.paymentStatus || 'UNKNOWN',
    orderStatus:
      order.orderStatus || order.fulfillmentStatus || order.paymentStatus || 'CREATED',
    fulfillmentStatus: order.fulfillmentStatus || order.orderStatus || '',
    total: Number(order.total) || 0,
    subtotal: Number(order.subtotal) || 0,
    discount: Number(order.discount) || 0,
    deliveryCharge: Number(order.deliveryCharge) || 0,
    deliveryType: order.deliveryType || 'standard',
    customer: {
      fullName: order.customer?.fullName || '',
      email: order.customer?.email || '',
      mobile: order.customer?.mobile || '',
      city: order.customer?.city || '',
      state: order.customer?.state || '',
      pincode: order.customer?.pincode || '',
    },
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          name: String(item?.name || 'Item'),
          qty: Math.max(1, Number(item?.qty) || 1),
          price: Number(item?.price) || 0,
        }))
      : [],
    designUpload: order.designUpload
      ? {
          originalName: order.designUpload.originalName || '',
          mimeType: order.designUpload.mimeType || '',
          size: Number(order.designUpload.size) || 0,
        }
      : null,
    createdAt: order.createdAt || null,
    verifiedAt: order.verifiedAt || null,
    updatedAt: order.updatedAt || null,
    adminStatusNote: order.adminStatusNote || '',
  };
}

function matchesSearch(values, search) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return values.some((value) => String(value || '').toLowerCase().includes(needle));
}

function createAdminCrmRepository({
  getDatabase,
  usersFile,
  ordersFile,
} = {}) {
  async function database() {
    return typeof getDatabase === 'function' ? getDatabase() : null;
  }

  async function rawCustomers() {
    const db = await database();
    if (db) {
      return db
        .collection('users')
        .find({})
        .project({
          passwordHash: 0,
          salt: 0,
          emailOtpHash: 0,
          emailOtpExpires: 0,
        })
        .limit(5000)
        .toArray();
    }
    return readJsonArray(usersFile);
  }

  async function rawOrders() {
    const db = await database();
    if (db) {
      return db.collection('orders').find({}).limit(5000).toArray();
    }
    return readJsonArray(ordersFile);
  }

  async function listCustomers(filters = {}) {
    const search = String(filters.search || '').trim();
    const status = String(filters.status || '').trim().toLowerCase();
    return (await rawCustomers())
      .map(safeCustomer)
      .filter((customer) => !status || customer.status === status)
      .filter((customer) =>
        matchesSearch(
          [
            customer.fullName,
            customer.email,
            customer.mobile,
            customer.referralCode,
            customer.id,
          ],
          search,
        ),
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async function getCustomer(customerId) {
    const db = await database();
    let customer;
    if (db) {
      customer = await db.collection('users').findOne(
        { id: customerId },
        {
          projection: {
            passwordHash: 0,
            salt: 0,
            emailOtpHash: 0,
            emailOtpExpires: 0,
          },
        },
      );
    } else {
      customer = readJsonArray(usersFile).find((row) => row.id === customerId);
    }
    return customer ? safeCustomer(customer) : null;
  }

  async function createCustomer(input) {
    const now = new Date().toISOString();
    const customer = {
      id: `cust_${crypto.randomUUID()}`,
      fullName: input.fullName,
      email: input.email,
      emailLower: normalizeEmail(input.email),
      mobile: cleanPhone(input.mobile),
      status: input.status || 'active',
      referralCode: input.referralCode || '',
      adminNotes: input.adminNotes || '',
      createdAt: now,
      updatedAt: now,
      createdByAdmin: true,
    };
    const db = await database();
    if (db) {
      await db.collection('users').insertOne(customer);
      return safeCustomer(customer);
    }
    const rows = readJsonArray(usersFile);
    rows.push(customer);
    writeJsonArray(usersFile, rows);
    return safeCustomer(customer);
  }

  async function updateCustomer(customerId, patch) {
    const db = await database();
    const set = {
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (set.email) set.emailLower = normalizeEmail(set.email);
    if (set.mobile) set.mobile = cleanPhone(set.mobile);

    if (db) {
      await db.collection('users').updateOne({ id: customerId }, { $set: set });
      return getCustomer(customerId);
    }
    const rows = readJsonArray(usersFile);
    const index = rows.findIndex((row) => row.id === customerId);
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...set };
    writeJsonArray(usersFile, rows);
    return safeCustomer(rows[index]);
  }

  async function listOrders(filters = {}) {
    const search = String(filters.search || '').trim();
    const status = String(filters.status || '').trim().toLowerCase();
    const paymentStatus = String(filters.paymentStatus || '').trim().toUpperCase();
    return (await rawOrders())
      .map(safeOrder)
      .filter((order) => {
        if (!status) return true;
        return String(order.orderStatus || '').toLowerCase() === status;
      })
      .filter((order) => {
        if (!paymentStatus) return true;
        return String(order.paymentStatus || '').toUpperCase() === paymentStatus;
      })
      .filter((order) =>
        matchesSearch(
          [
            order.localOrderId,
            order.token,
            order.razorpayOrderId,
            order.paymentId,
            order.customer.fullName,
            order.customer.email,
            order.customer.mobile,
          ],
          search,
        ),
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async function findOrderRecord(identifier) {
    const db = await database();
    if (db) {
      return db.collection('orders').findOne({
        $or: [
          { localOrderId: identifier },
          { token: identifier },
          { razorpayOrderId: identifier },
          { trackingToken: identifier },
        ],
      });
    }
    return readJsonArray(ordersFile).find((order) =>
      [
        order.localOrderId,
        order.token,
        order.razorpayOrderId,
        order.trackingToken,
      ].includes(identifier),
    );
  }

  async function getOrder(identifier) {
    const order = await findOrderRecord(identifier);
    return order ? safeOrder(order) : null;
  }

  async function updateOrderStatus(identifier, statusPatch) {
    const order = await findOrderRecord(identifier);
    if (!order) return null;
    const now = new Date().toISOString();
    const set = {
      orderStatus: statusPatch.orderStatus,
      fulfillmentStatus: statusPatch.orderStatus,
      adminStatusNote: statusPatch.adminStatusNote || '',
      updatedAt: now,
    };
    const db = await database();
    if (db) {
      await db.collection('orders').updateOne(
        { _id: order._id },
        { $set: set },
      );
      return getOrder(identifier);
    }
    const rows = readJsonArray(ordersFile);
    const index = rows.findIndex((row) =>
      [
        row.localOrderId,
        row.token,
        row.razorpayOrderId,
        row.trackingToken,
      ].includes(identifier),
    );
    if (index === -1) return null;
    rows[index] = { ...rows[index], ...set };
    writeJsonArray(ordersFile, rows);
    return safeOrder(rows[index]);
  }

  return Object.freeze({
    listCustomers,
    getCustomer,
    createCustomer,
    updateCustomer,
    listOrders,
    getOrder,
    updateOrderStatus,
  });
}

module.exports = {
  createAdminCrmRepository,
};
