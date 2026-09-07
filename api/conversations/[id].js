const { json, requireAdmin, supabase, readBody } = require('../_lib');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.query?.id || new URL(req.url, `https://${req.headers.host}`).pathname.split('/').filter(Boolean).pop() || '');
  if (!id) return json(res, 400, { error: 'Conversation id is required' });
  try {
    if (req.method === 'GET') {
      const rows = await supabase(`conversations?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!rows?.[0]) return json(res, 404, { error: 'Conversation not found' });
      const messages = await supabase(`messages?conversation_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`);
      return json(res, 200, { conversation: rows[0], messages: messages || [] });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const allowed = {};
      for (const key of ['status', 'assigned_to', 'unread_for_admin', 'unread_for_student']) {
        if (Object.prototype.hasOwnProperty.call(body, key)) allowed[key] = body[key];
      }
      if (allowed.status && !['open','pending','resolved','closed'].includes(allowed.status)) {
        return json(res, 400, { error: 'Invalid status' });
      }
      if (!Object.keys(allowed).length) return json(res, 400, { error: 'No supported fields supplied' });
      const updated = await supabase(`conversations?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(allowed)
      });
      if (!updated?.[0]) return json(res, 404, { error: 'Conversation not found' });
      return json(res, 200, updated[0]);
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message || 'Request failed' });
  }
};
