const crypto = require('crypto');
const { supabase, readBody, json, storageUpload, storageSignedUrl } = require('../_lib');

const ATTACHMENT_BUCKET = 'communication-attachments';
const MAX_FILES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

// Shopify has two historical customer records for Donna Mae. The first key is
// the account she actually uses to sign in; aliases are retained only so the
// existing message history can be joined without deleting production data.
const CUSTOMER_ALIASES = {
  '10218638344499': {
    ids: ['10235422114099'],
    name: 'Donamae Morales',
    email: 'moralesdnm17@gmail.com'
  }
};

function normalizeCustomerId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/(?:gid:\/\/shopify\/Customer\/)?(\d+)$/i);
  return match ? match[1] : raw;
}

function customerIdVariants(value) {
  const normalized = normalizeCustomerId(value);
  if (!normalized) return [];
  return [...new Set([normalized, `gid://shopify/Customer/${normalized}`, String(value || '').trim()].filter(Boolean))];
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function verifyProxy(req) {
  // Shopify calls this the client secret in current custom-app settings. Keep
  // the older API-secret name as a backwards-compatible alias so existing
  // deployments do not need a risky credential replacement.
  const secret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error('Shopify app secret is not configured.');
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const signature = url.searchParams.get('signature');
  const timestamp = Number(url.searchParams.get('timestamp') || 0);
  if (!signature || !timestamp) return { ok: false, status: 401, message: 'Invalid Shopify proxy request.' };
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return { ok: false, status: 401, message: 'Expired Shopify proxy request.' };
  const pairs = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (key === 'signature') continue;
    pairs.push([key, value]);
  }
  const grouped = {};
  for (const [key, value] of pairs) (grouped[key] ||= []).push(value);
  const message = Object.keys(grouped).sort().map(k => `${k}=${grouped[k].join(',')}`).join('');
  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, message: 'Invalid Shopify proxy signature.' };
  return { ok: true, url };
}

async function getConversation(customerId) {
  for (const candidate of customerIdVariants(customerId)) {
    const rows = await supabase(`conversations?shopify_customer_id=eq.${encodeURIComponent(candidate)}&select=*&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function getStudent(customerId) {
  for (const candidate of customerIdVariants(customerId)) {
    const rows = await supabase(`students?shopify_customer_id=eq.${encodeURIComponent(candidate)}&select=id,name,email&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function linkConversationToStudent(conversation, customerId) {
  if (!conversation) return conversation;
  if (conversation.student_id && conversation.customer_name && conversation.customer_name !== 'BTM Student' && conversation.customer_name !== 'Student' && conversation.customer_email) return conversation;
  const student = await getStudent(customerId);
  if (!student) return conversation;

  const changes = {};
  if (conversation.student_id !== student.id) changes.student_id = student.id;
  if (student.name && (!conversation.customer_name || conversation.customer_name === 'BTM Student' || conversation.customer_name === 'Student')) {
    changes.customer_name = student.name;
  }
  if (student.email && !conversation.customer_email) changes.customer_email = student.email;
  if (!Object.keys(changes).length) return conversation;

  const updated = await supabase(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(changes)
  });
  return updated[0] || { ...conversation, ...changes };
}

async function reconcileConversation(customerId) {
  customerId = normalizeCustomerId(customerId);
  const identity = CUSTOMER_ALIASES[customerId];
  const matches = [];

  for (const candidate of customerIdVariants(customerId)) {
    const rows = await supabase(`conversations?shopify_customer_id=eq.${encodeURIComponent(candidate)}&select=*`);
    for (const row of rows || []) if (!matches.some(existing => existing.id === row.id)) matches.push(row);
  }

  let canonical = matches.find(row => String(row.shopify_customer_id) === customerId) || matches[0] || null;
  for (const duplicate of matches) {
    if (!canonical || duplicate.id === canonical.id) continue;
    await supabase(`messages?conversation_id=eq.${encodeURIComponent(duplicate.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ conversation_id: canonical.id })
    });
    const canonicalNameIsGeneric = !canonical.customer_name || canonical.customer_name === 'BTM Student' || canonical.customer_name === 'Student';
    const updated = await supabase(`conversations?id=eq.${encodeURIComponent(canonical.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        student_id: canonical.student_id || duplicate.student_id,
        customer_name: canonicalNameIsGeneric ? duplicate.customer_name : canonical.customer_name,
        customer_email: canonical.customer_email || duplicate.customer_email,
        shopify_customer_id: customerId,
        status: 'open',
        unread_for_admin: Boolean(canonical.unread_for_admin || duplicate.unread_for_admin),
        unread_for_student: Boolean(canonical.unread_for_student || duplicate.unread_for_student),
        updated_at: new Date().toISOString()
      })
    });
    canonical = updated[0] || canonical;
    await supabase(`conversations?id=eq.${encodeURIComponent(duplicate.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'merged', unread_for_admin: false, unread_for_student: false, updated_at: new Date().toISOString() })
    });
  }

  if (canonical && String(canonical.shopify_customer_id) !== customerId) {
    const normalized = await supabase(`conversations?id=eq.${encodeURIComponent(canonical.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ shopify_customer_id: customerId })
    });
    canonical = normalized[0] || canonical;
  }

  if (!identity || canonical) return canonical;
  for (const aliasId of identity.ids) {
    const duplicate = await getConversation(aliasId);
    if (!duplicate) continue;

    if (!canonical) {
      const updated = await supabase(`conversations?id=eq.${encodeURIComponent(duplicate.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ shopify_customer_id: customerId, customer_name: identity.name, customer_email: identity.email, status: 'open', updated_at: new Date().toISOString() })
      });
      canonical = updated[0] || duplicate;
    } else if (duplicate.id !== canonical.id) {
      await supabase(`messages?conversation_id=eq.${encodeURIComponent(duplicate.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ conversation_id: canonical.id })
      });
      const updated = await supabase(`conversations?id=eq.${encodeURIComponent(canonical.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          student_id: canonical.student_id || duplicate.student_id,
          customer_name: identity.name,
          customer_email: identity.email,
          status: 'open',
          unread_for_admin: Boolean(canonical.unread_for_admin || duplicate.unread_for_admin),
          unread_for_student: Boolean(canonical.unread_for_student || duplicate.unread_for_student),
          updated_at: new Date().toISOString()
        })
      });
      canonical = updated[0] || canonical;
      await supabase(`conversations?id=eq.${encodeURIComponent(duplicate.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'merged', unread_for_admin: false, unread_for_student: false, updated_at: new Date().toISOString() })
      });
    }

    const studentId = canonical.student_id || duplicate.student_id;
    if (studentId) {
      await supabase(`students?id=eq.${encodeURIComponent(studentId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ shopify_customer_id: customerId, name: identity.name, email: identity.email, updated_at: new Date().toISOString() })
      });
    }
  }
  return canonical;
}

async function ensureConversation(customerId) {
  customerId = normalizeCustomerId(customerId);
  const existing = await reconcileConversation(customerId);
  if (existing) return await linkConversationToStudent(existing, customerId);
  const student = await getStudent(customerId);
  const created = await supabase('conversations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      shopify_customer_id: customerId,
      student_id: student?.id || null,
      customer_name: student?.name || 'BTM Student',
      customer_email: student?.email || null,
      status: 'open',
      unread_for_admin: false,
      unread_for_student: false
    })
  });
  return created[0];
}

async function getMessages(conversationId) {
  const rows = await supabase(`messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,sender_type,sender_name,body,attachments,created_at&order=created_at.asc`);
  return await Promise.all((rows || []).map(async message => {
    const isStudent = message.sender_type === 'student';
    const isBree = !isStudent && String(message.sender_name || '').trim().toLowerCase() === 'bree wilkinson';
    const attachments = await Promise.all((Array.isArray(message.attachments) ? message.attachments : []).map(async item => ({
      ...item,
      url: item.path ? await storageSignedUrl(ATTACHMENT_BUCKET, item.path, 3600) : null
    })));
    return {
      ...message,
      attachments,
      sender_name: isStudent ? (message.sender_name || 'Student') : (isBree ? 'Bree Wilkinson' : 'BTM Support Team'),
      sender_profile: isStudent ? 'student' : (isBree ? 'bree' : 'support'),
      alignment: isStudent ? 'right' : 'left'
    };
  }));
}

async function readProxyBody(req) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('multipart/form-data')) return { fields: await readBody(req), files: [] };

  let rawBuffer;
  if (Buffer.isBuffer(req.body)) rawBuffer = req.body;
  else if (typeof req.body === 'string') rawBuffer = Buffer.from(req.body, 'binary');
  else rawBuffer = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('Invalid multipart message request.');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const raw = rawBuffer.toString('binary');
  const fields = {};
  const files = [];
  for (const part of raw.split(`--${boundary}`)) {
    const separator = part.indexOf('\r\n\r\n');
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    const name = headers.match(/name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const filename = headers.match(/filename="([^"]*)"/i)?.[1];
    const content = part.slice(separator + 4).replace(/\r\n$/, '');
    if (filename !== undefined) {
      if (!filename) continue;
      files.push({ field: name, name: filename, type: headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || 'application/octet-stream', buffer: Buffer.from(content, 'binary') });
    } else {
      fields[name] = Buffer.from(content, 'binary').toString('utf8');
    }
  }
  return { fields, files };
}

function safeFileName(name) {
  const cleaned = String(name || 'file').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120);
  return cleaned || 'file';
}

async function uploadMessageFiles(conversationId, files) {
  if (files.length > MAX_FILES) throw Object.assign(new Error(`You can attach up to ${MAX_FILES} files per message.`), { status: 400 });
  return await Promise.all(files.map(async file => {
    if (file.buffer.length > MAX_FILE_BYTES) throw Object.assign(new Error(`${file.name} is larger than 4 MB.`), { status: 400 });
    if (!ALLOWED_FILE_TYPES.has(file.type)) throw Object.assign(new Error(`${file.name} is not a supported file type.`), { status: 400 });
    const path = `${conversationId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safeFileName(file.name)}`;
    await storageUpload(ATTACHMENT_BUCKET, path, file.buffer, file.type);
    return { path, name: file.name.slice(0, 180), type: file.type, size: file.buffer.length };
  }));
}

function page(conversation, messages, customerId) {
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const items = messages.map(m => `<div class="msg ${m.sender_type === 'admin' ? 'admin' : 'student'}"><div>${safe(m.body)}</div><small>${safe(m.sender_type === 'admin' ? m.sender_name : 'You')}</small></div>`).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTM Messages</title><style>body{font-family:Georgia,serif;background:#f4eee3;margin:0;color:#27231e}.wrap{max-width:760px;margin:40px auto;padding:0 18px}.card{background:#fffdf8;border:1px solid #dfd4c2;border-radius:16px;padding:24px;box-shadow:0 10px 30px #0000000d}h1{margin:0 0 6px;font-size:30px}.sub{color:#8a7e6d;margin-bottom:22px}.thread{display:flex;flex-direction:column;gap:10px;min-height:220px}.msg{max-width:78%;padding:12px 14px;border-radius:14px;background:#f3ede3}.msg.student{align-self:flex-end;background:#f3ede3}.msg.admin{align-self:flex-start;background:#b89255;color:white}.msg small{display:block;margin-top:5px;opacity:.7;font-size:11px}.form{display:flex;gap:10px;margin-top:20px}.form textarea{flex:1;border:1px solid #d9cdbb;border-radius:12px;padding:12px;font:inherit;resize:vertical}.form button{border:0;border-radius:12px;background:#b89255;color:white;padding:0 20px;font-weight:bold}.notice{padding:12px;border-radius:10px;background:#f7e7c9;margin-bottom:16px}</style></head><body><main class="wrap"><div class="card"><h1>BTM Messages</h1><div class="sub">Beauty Training Mastery support</div><div id="notice" class="notice" style="display:none"></div><div class="thread" id="thread">${items || '<div class="sub">No messages yet. Send your first message below.</div>'}</div><form class="form" id="form"><textarea id="body" rows="2" placeholder="Type your message..."></textarea><button>Send</button></form></div></main><script>const form=document.getElementById('form'),body=document.getElementById('body'),notice=document.getElementById('notice');form.addEventListener('submit',async e=>{e.preventDefault();const text=body.value.trim();if(!text)return;const r=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:text})});const d=await r.json();if(!r.ok){notice.textContent=d.error||'Could not send message';notice.style.display='block';return}location.reload()});setInterval(()=>{if(!document.hidden&&!body.value.trim())location.reload()},5000);</script></body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const wantsJson = requestUrl.searchParams.get('format') === 'json' || String(req.headers.accept || '').includes('application/json');
  try {
    console.log('[shopify/proxy] request', { method: req.method, wantsJson });
    const auth = verifyProxy(req);
    if (!auth.ok) return wantsJson ? json(res, auth.status, { error: auth.message }) : html(res, auth.status, `<p>${auth.message}</p>`);
    const customerId = auth.url.searchParams.get('logged_in_customer_id');
    if (!customerId) return wantsJson ? json(res, 401, { error: 'Please log in to your BTM/Shopify account to use Messages.' }) : html(res, 401, '<p>Please log in to your BTM/Shopify account to use Messages.</p>');
    const conversation = await ensureConversation(customerId);
    if (req.method === 'POST') {
      const parsed = await readProxyBody(req);
      const body = parsed.fields;
      const uploadFiles = parsed.files.filter(file => file.field === 'files[]' || file.field === 'files' || file.field === 'attachments');
      const text = String(body.body || body.message || '').trim();
      if (!text && !uploadFiles.length) return json(res, 400, { error: 'Add a message or attachment before sending.' });
      const attachments = await uploadMessageFiles(conversation.id, uploadFiles);
      const createdRows = await supabase('messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conversation.id, sender_type: 'student', sender_name: String(body.customer_name || 'Student').slice(0, 120), body: text, attachments }) });
      await supabase(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ customer_name: body.customer_name || conversation.customer_name, customer_email: body.customer_email || conversation.customer_email, unread_for_admin: true, status: 'open', updated_at: new Date().toISOString() }) });
      const created = createdRows?.[0] || {};
      const responseAttachments = await Promise.all(attachments.map(async item => ({ ...item, url: await storageSignedUrl(ATTACHMENT_BUCKET, item.path, 3600) })));
      console.log('[shopify/proxy] student message saved', { customerId, conversationId: conversation.id, attachments: attachments.length });
      return json(res, 200, { ok: true, conversationId: conversation.id, message: { ...created, attachments: responseAttachments, sender_profile: 'student', alignment: 'right' } });
    }
    const messages = await getMessages(conversation.id);
    if (conversation.unread_for_student) await supabase(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ unread_for_student: false }) });
    console.log('[shopify/proxy] messages loaded', { customerId, conversationId: conversation.id, count: messages.length });
    if (wantsJson) return json(res, 200, { conversationId: conversation.id, messages });
    return html(res, 200, page(conversation, messages, customerId));
  } catch (e) {
    console.error('[shopify/proxy] failed', { error: String(e.message || e), stack: e.stack });
    const status = e.status || 500;
    const message = status < 500 ? String(e.message || e) : 'Unable to process member messages.';
    return wantsJson ? json(res, status, { error: message }) : html(res, status, `<p>BTM Messages error: ${safeError(message)}</p>`);
  }
};

function safeError(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
