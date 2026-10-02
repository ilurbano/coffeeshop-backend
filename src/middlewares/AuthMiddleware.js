const AuthResponses = require('../responses/AuthResponses');

const { verifyJWT } = require('../utils/AuthUtils');

const requireToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json(
    AuthResponses.session.invalidSession()
  );

  try {
    const user = await verifyJWT(token);

    if (!user) return res.status(401).json(
      AuthResponses.session.invalidSession()
    );

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json(
      AuthResponses.session.invalidSession()
    );
  }
}

const requireRoles = (roles) => (req, res, next) => {
  let effectiveRoles = roles;

  if (!Array.isArray(roles)) effectiveRoles = [roles];

  if (!req.user || !effectiveRoles.includes(req.user.role)) {
    return res.status(403).json(
      AuthResponses.session.forbidden()
    );
  }

  next();
}

module.exports = {
  requireToken,
  requireRoles
};
