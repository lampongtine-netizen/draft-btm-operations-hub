const crypto = require('crypto');
const { supabase, readBody } = require('../_lib');

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

function verifyProxy(req) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error('SHOPIFY_API_SECRET is not configured.');
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
  const rows = await supabase(`conversations?shopify_customer_id=eq.${encodeURIComponent(customerId)}&select=*&limit=1`);
  return rows[0] || null;
}

async function ensureConversation(customerId) {
  const existing = await getConversation(customerId);
  if (existing) return existing;
  const created = await supabase('conversations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      shopify_customer_id: customerId,
      customer_name: 'BTM Student',
      customer_email: null,
      status: 'open',
      unread_for_admin: false,
      unread_for_student: false
    })
  });
  return created[0];
}

async function getMessages(conversationId) {
  return await supabase(`messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,sender_type,sender_name,body,created_at&order=created_at.asc`);
}

function page(conversation, messages, customerId) {
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const items = messages.map(m => `<div class="msg ${m.sender_type === 'admin' ? 'admin' : 'student'}"><div>${safe(m.body)}</div><small>${safe(m.sender_type === 'admin' ? 'BTM Team' : 'You')}</small></div>`).join('');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTM Messages</title><style>body{font-family:Georgia,serif;background:#f4eee3;margin:0;color:#27231e}.wrap{max-width:760px;margin:40px auto;padding:0 18px}.card{background:#fffdf8;border:1px solid #dfd4c2;border-radius:16px;padding:24px;box-shadow:0 10px 30px #0000000d}h1{margin:0 0 6px;font-size:30px}.sub{color:#8a7e6d;margin-bottom:22px}.thread{display:flex;flex-direction:column;gap:10px;min-height:220px}.msg{max-width:78%;padding:12px 14px;border-radius:14px;background:#f3ede3}.msg.student{align-self:flex-end;background:#f3ede3}.msg.admin{align-self:flex-start;background:#b89255;color:white}.msg small{display:block;margin-top:5px;opacity:.7;font-size:11px}.form{display:flex;gap:10px;margin-top:20px}.form textarea{flex:1;border:1px solid #d9cdbb;border-radius:12px;padding:12px;font:inherit;resize:vertical}.form button{border:0;border-radius:12px;background:#b89255;color:white;padding:0 20px;font-weight:bold}.notice{padding:12px;border-radius:10px;background:#f7e7c9;margin-bottom:16px}</style></head><body><main class="wrap"><div class="card"><h1>BTM Messages</h1><div class="sub">Beauty Training Mastery support</div><div id="notice" class="notice" style="display:none"></div><div class="thread" id="thread">${items || '<div class="sub">No messages yet. Send your first message below.</div>'}</div><form class="form" id="form"><textarea id="body" rows="2" placeholder="Type your message..."></textarea><button>Send</button></form></div></main><script>const form=document.getElementById('form'),body=document.getElementById('body'),notice=document.getElementById('notice');form.addEventListener('submit',async e=>{e.preventDefault();const text=body.value.trim();if(!text)return;const r=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:text})});const d=await r.json();if(!r.ok){notice.textContent=d.error||'Could not send message';notice.style.display='block';return}location.reload()});</script></body></html>`;
}

module.exports = async (req, res) => {
  try {
    const auth = verifyProxy(req);
    if (!auth.ok) return html(res, auth.status, `<p>${auth.message}</p>`);
    const customerId = auth.url.searchParams.get('logged_in_customer_id');
    if (!customerId) return html(res, 401, '<p>Please log in to your BTM/Shopify account to use Messages.</p>');
    const conversation = await ensureConversation(customerId);
    if (req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.body || '').trim();
      if (!text) return require('../_lib').json(res, 400, { error: 'Message cannot be empty.' });
      await supabase('messages', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ conversation_id: conversation.id, sender_type: 'student', sender_name: 'Student', body: text }) });
      await supabase(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ unread_for_admin: true, status: 'open' }) });
      return require('../_lib').json(res, 200, { ok: true });
    }
    const messages = await getMessages(conversation.id);
    return html(res, 200, page(conversation, messages, customerId));
  } catch (e) {
    console.error(e);
    return html(res, 500, `<p>BTM Messages error: ${String(e.message || e)}</p>`);
  }
};
