const AuthRoutes = require('./AuthRoutes');

const initializeRoutes = (app) => {
  app.use('/api/auth', AuthRoutes);
}

module.exports = {
  initializeRoutes
}
