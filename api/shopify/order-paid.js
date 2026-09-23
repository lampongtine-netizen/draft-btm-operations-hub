const crypto = require('crypto');
const { supabase, json } = require('../_lib');

const PRODUCT_ACCESS = [
  {
    title: 'business advisory & support — level 1',
    program: 'Business Advisory & Support',
    level: 'Level 1',
    tags: ['BTM Level 1', 'BTM Business Advisory', 'Business Advisory & Support']
  },
  {
    title: 'scale society — level 2',
    program: 'Scale Society',
    level: 'Level 2',
    tags: ['BTM Level 2', 'BTM Scale Society', 'Scale Society', 'BTM_SCALE_SOCIETY']
  },
  {
    title: 'educators pathway — lifetime access',
    program: 'Educators Pathway',
    level: 'Lifetime Access',
    tags: ['BTM_EDUCATION_PATHWAY']
  }
];

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyWebhook(rawBody, req) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;
  const supplied = String(req.headers['x-shopify-hmac-sha256'] || '');
  if (!secret || !supplied) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function findAccess(order) {
  const titles = (order.line_items || []).map(item => normalize(item.title || item.name));
  return PRODUCT_ACCESS.filter(access => titles.includes(access.title));
}

async function findStudent(customerId) {
  const rows = await supabase(`students?shopify_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`);
  return rows[0] || null;
}

async function ensureStudent(order, primaryAccess) {
  const customerId = String(order.customer.id);
  const existing = await findStudent(customerId);
  const name = [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ').trim() || order.billing_address?.name || 'BTM Member';
  const data = {
    shopify_customer_id: customerId,
    name,
    email: order.email || order.customer.email || null,
    phone: order.phone || order.customer.phone || null,
    program: primaryAccess.program,
    level: primaryAccess.level,
    status: 'Active',
    payment_status: 'Current',
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const rows = await supabase(`students?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data)
    });
    return rows[0] || { ...existing, ...data };
  }

  const rows = await supabase('students', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data)
  });
  return rows[0];
}

async function recordPayment(order, student, accessActive) {
  const eventId = `shopify-orders-paid-${order.id}`;
  const found = await supabase(`payment_events?external_event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`);
  if (found[0]) return;
  await supabase('payment_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      external_event_id: eventId,
      event_type: 'orders/paid',
      student_id: student.id,
      shopify_customer_id: String(order.customer.id),
      payment_status: order.financial_status || 'paid',
      subscription_status: 'active',
      access_active: accessActive,
      amount: order.current_total_price || order.total_price || null,
      currency: order.currency || null,
      payload: { order_id: String(order.id), order_name: order.name || null }
    })
  });
}

async function ensureEntitlement(order, student, access) {
  const reference = `shopify-order-${order.id}-${access.program}`;
  const found = await supabase(`access_entitlements?source_reference=eq.${encodeURIComponent(reference)}&select=id&limit=1`);
  if (found[0]) return;
  await supabase('access_entitlements', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      student_id: student.id,
      program: access.program,
      level: access.level,
      source: 'shopify',
      source_reference: reference,
      status: 'active',
      metadata: { order_id: String(order.id), order_name: order.name || null }
    })
  });
}

async function ensureConversation(student, customerId) {
  const found = await supabase(`conversations?shopify_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`);
  const data = { student_id: student.id, customer_name: student.name, customer_email: student.email, status: 'open' };
  if (found[0]) {
    await supabase(`conversations?id=eq.${encodeURIComponent(found[0].id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data)
    });
    return;
  }
  await supabase('conversations', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ shopify_customer_id: customerId, ...data })
  });
}

async function addCustomerTags(shop, customerId, tags) {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.');
  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: 'mutation AddTags($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } } }',
      variables: { id: `gid://shopify/Customer/${customerId}`, tags: [...new Set(tags)] }
    })
  });
  const result = await response.json();
  const errors = result.errors || result.data?.tagsAdd?.userErrors || [];
  if (!response.ok || errors.length) throw new Error(errors.map(error => error.message).join('; ') || 'Unable to tag Shopify customer.');
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const rawBody = await readRawBody(req);
    if (!verifyWebhook(rawBody, req)) return json(res, 401, { error: 'Invalid Shopify webhook signature.' });
    const order = JSON.parse(rawBody.toString('utf8'));
    const access = findAccess(order);
    if (!access.length) return json(res, 200, { ok: true, ignored: true });
    if (!order.customer?.id) return json(res, 422, { error: 'A Shopify customer account is required for portal access.' });

    const customerId = String(order.customer.id);
    const primaryAccess = access.find(item => item.level === 'Level 2') || access.find(item => item.level === 'Level 1') || access[0];
    const student = await ensureStudent(order, primaryAccess);
    for (const item of access) await ensureEntitlement(order, student, item);
    await ensureConversation(student, customerId);
    await addCustomerTags(String(req.headers['x-shopify-shop-domain'] || ''), customerId, access.flatMap(item => item.tags));
    await recordPayment(order, student, true);

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('[shopify/order-paid] failed', { error: String(error.message || error) });
    return json(res, 500, { error: 'Unable to grant paid portal access.' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };

