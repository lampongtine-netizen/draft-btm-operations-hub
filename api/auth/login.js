const { json, readBody, setSessionCookie } = require('../_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { email, password } = await readBody(req);
    const expectedEmail = process.env.BTM_ADMIN_EMAIL;
    const expectedPassword = process.env.BTM_ADMIN_PASSWORD;
    if (!expectedEmail || !expectedPassword) return json(res, 503, { error: 'Admin login is not configured yet.' });
    if (String(email || '').trim().toLowerCase() !== expectedEmail.trim().toLowerCase() || password !== expectedPassword) {
      return json(res, 401, { error: 'Incorrect email or password.' });
    }
    setSessionCookie(res, expectedEmail.trim().toLowerCase());
    return json(res, 200, { ok: true, email: expectedEmail.trim().toLowerCase() });
  } catch (e) {
    return json(res, 400, { error: e.message || 'Invalid request' });
  }
};
