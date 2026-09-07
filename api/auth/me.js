const { json, getSession } = require('../_lib');
module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const session = getSession(req);
  return json(res, 200, { authenticated: !!session, email: session?.email || null });
};
