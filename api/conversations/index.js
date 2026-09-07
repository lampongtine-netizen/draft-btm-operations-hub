const { json, requireAdmin, supabase, readBody } = require('../_lib');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search');
      let path = 'conversations?select=*&order=updated_at.desc';
      if (status && status !== 'all') path += `&status=eq.${encodeURIComponent(status)}`;
      if (search) {
        const safe = search.replace(/[(),]/g, '');
        path += `&or=(customer_name.ilike.*${encodeURIComponent(safe)}*,customer_email.ilike.*${encodeURIComponent(safe)}*)`;
      }
      const rows = await supabase(path);
      const enriched = await Promise.all((rows || []).map(async row => {
        const msgs = await supabase(`messages?conversation_id=eq.${encodeURIComponent(row.id)}&select=id,sender_type,body,created_at&order=created_at.desc&limit=1`);
        return { ...row, last_message: msgs?.[0] || null };
      }));
      return json(res, 200, enriched);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.shopify_customer_id) return json(res, 400, { error: 'shopify_customer_id is required' });
      const existing = await supabase(`conversations?shopify_customer_id=eq.${encodeURIComponent(body.shopify_customer_id)}&select=*&limit=1`);
      if (existing?.[0]) return json(res, 200, existing[0]);
      const created = await supabase('conversations', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        shopify_customer_id: String(body.shopify_customer_id),
        customer_name: body.customer_name || 'BTM Student',
        customer_email: body.customer_email || null,
        status: 'open',
        assigned_to: body.assigned_to || null,
        unread_for_admin: false,
        unread_for_student: false
      }) });
      return json(res, 201, created?.[0] || created);
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (e) { return json(res, e.status || 500, { error: e.message }); }
};
