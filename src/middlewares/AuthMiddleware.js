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

module.exports = {
  requireToken,
};
