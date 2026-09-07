const { json, requireAdmin, supabase, readBody } = require('../../_lib');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const path = new URL(req.url, `https://${req.headers.host}`).pathname.split('/').filter(Boolean);
  const id = String(req.query?.id || path[path.indexOf('conversations') + 1] || '');
  if (!id) return json(res, 400, { error: 'Conversation id is required' });
  try {
    if (req.method === 'GET') {
      const rows = await supabase(`messages?conversation_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`);
      return json(res, 200, rows || []);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const text = String(body.body || '').trim();
      if (!text) return json(res, 400, { error: 'Message body is required' });
      if (text.length > 10000) return json(res, 400, { error: 'Message is too long' });
      const created = await supabase('messages', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          conversation_id: id,
          sender_type: 'admin',
          sender_name: String(body.sender_name || 'BTM Support').slice(0, 120),
          body: text,
          attachment_url: body.attachment_url || null
        })
      });
      await supabase(`conversations?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ unread_for_student: true, unread_for_admin: false, status: 'open' })
      });
      return json(res, 201, created?.[0] || created);
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Request failed' });
  }
};
