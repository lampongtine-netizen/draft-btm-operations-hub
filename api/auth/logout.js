const { json, clearSessionCookie } = require('../_lib');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};
