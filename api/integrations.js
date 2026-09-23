const crypto = require('crypto');
const { json, supabase, readBody } = require('./_lib');

function safeEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function programDetails(value) {
  const raw = clean(value);
  const key = raw.toLowerCase();

  if (key.includes('educat')) {
    return {
      program: 'Educators Pathway',
      level: 'Education Pathway',
      educatorPathway: true
    };
  }

  if (key.includes('scale') || key.includes('level 2')) {
    return {
      program: 'Scale Society',
      level: 'Level 2',
      educatorPathway: false
    };
  }

  return {
    program: raw || 'Business Advisory & Support',
    level: 'Level 1',
    educatorPathway: false
  };
}

function paymentIsActive(body) {
  if (typeof body.accessActive === 'boolean') return body.accessActive;
  const status = clean(body.paymentStatus || body.subscriptionStatus).toLowerCase();
  return ['paid', 'active', 'trialing', 'succeeded', 'complete', 'completed'].includes(status);
}

function moneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  // Make maps Stripe checkout.session.amount_total, which is expressed in cents.
  return amount / 100;
}

async function findStudent(shopifyCustomerId, email) {
  if (shopifyCustomerId) {
    const rows = await supabase(`students?shopify_customer_id=eq.${encodeURIComponent(shopifyCustomerId)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }

  if (email) {
    const rows = await supabase(`students?email=ilike.${encodeURIComponent(email)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }

  return null;
}

async function saveStudent(existing, body, details, active, now) {
  const shopifyCustomerId = clean(body.shopifyCustomerId);
  const email = clean(body.email).toLowerCase();
  const name = clean(body.name) || existing?.name || email || 'BTM Member';
  const record = {
    name,
    email: email || existing?.email || null,
    shopify_customer_id: shopifyCustomerId || existing?.shopify_customer_id || null,
    program: details.program,
    level: details.level,
    educator_pathway: details.educatorPathway,
    status: active ? (existing?.status || 'Active') : 'Payment Review',
    payment_status: active ? 'Current' : (clean(body.paymentStatus) || 'Review'),
    last_activity_at: now,
    updated_at: now
  };

  if (existing) {
    const rows = await supabase(`students?id=eq.${encodeURIComponent(existing.id)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    return rows?.[0] || { ...existing, ...record };
  }

  record.enrolled_at = now;
  record.created_at = now;
  const rows = await supabase('students?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(record)
  });
  return rows?.[0];
}

async function savePayment(body, student, active) {
  const eventId = clean(body.eventId);
  const record = {
    external_event_id: eventId,
    event_type: clean(body.eventType) || 'payment.updated',
    student_id: student.id,
    shopify_customer_id: clean(body.shopifyCustomerId) || null,
    stripe_customer_id: clean(body.stripeCustomerId) || null,
    stripe_subscription_id: clean(body.stripeSubscriptionId) || null,
    payment_status: clean(body.paymentStatus) || null,
    subscription_status: clean(body.subscriptionStatus) || null,
    access_active: active,
    amount: moneyAmount(body.amount),
    currency: clean(body.currency).toUpperCase() || 'AUD',
    payload: body
  };

  await supabase('payment_events?on_conflict=external_event_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(record)
  });
}

async function saveEntitlement(body, student, details, active, now) {
  const sourceReference = clean(body.stripeSubscriptionId) || clean(body.stripeCustomerId) || clean(body.eventId);
  const record = {
    student_id: student.id,
    program: details.program,
    level: details.level,
    source: 'make',
    source_reference: sourceReference,
    status: active ? 'active' : 'inactive',
    starts_at: now,
    metadata: {
      event_id: clean(body.eventId),
      event_type: clean(body.eventType),
      payment_status: clean(body.paymentStatus)
    },
    updated_at: now
  };

  await supabase('access_entitlements?on_conflict=student_id,source,source_reference,program', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(record)
  });
}

async function linkConversation(body, student) {
  const shopifyCustomerId = clean(body.shopifyCustomerId);
  if (!shopifyCustomerId) return;

  const path = `conversations?shopify_customer_id=eq.${encodeURIComponent(shopifyCustomerId)}&select=id&limit=1`;
  const rows = await supabase(path);
  const record = {
    student_id: student.id,
    customer_name: student.name,
    customer_email: student.email,
    shopify_customer_id: shopifyCustomerId
  };

  if (rows?.[0]) {
    await supabase(`conversations?id=eq.${encodeURIComponent(rows[0].id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });
    return;
  }

  await supabase('conversations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...record, status: 'open' })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (clean(req.query?.action) !== 'payment') {
    return json(res, 400, { error: 'Unsupported integration action' });
  }

  const secret = process.env.MAKE_INTEGRATION_SECRET;
  if (!secret) return json(res, 503, { error: 'Make integration is not configured' });

  const authorization = clean(req.headers.authorization);
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!safeEqual(token, secret)) return json(res, 401, { error: 'Unauthorized' });

  try {
    const body = await readBody(req);
    if (!clean(body.eventId)) return json(res, 400, { error: 'eventId is required' });
    if (!clean(body.shopifyCustomerId) && !clean(body.email)) {
      return json(res, 400, { error: 'shopifyCustomerId or email is required' });
    }

    const now = new Date().toISOString();
    const details = programDetails(body.program);
    const active = paymentIsActive(body);
    const existing = await findStudent(clean(body.shopifyCustomerId), clean(body.email).toLowerCase());
    const student = await saveStudent(existing, body, details, active, now);

    if (!student?.id) throw new Error('Student record could not be created');

    await savePayment(body, student, active);
    await saveEntitlement(body, student, details, active, now);
    await linkConversation(body, student);

    return json(res, 200, {
      ok: true,
      studentId: student.id,
      accessActive: active,
      program: details.program
    });
  } catch (error) {
    console.error('Make payment integration failed', error);
    return json(res, error.status || 500, { error: error.message || 'Integration failed' });
  }
};
