const cors = require('cors');
const dotenv = require('dotenv');
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');

const routes = require('./routes');

//===============//
// DOTENV CONFIG //
//===============//

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

const CORS_ORIGINS = process.env.CORS_ORIGINS?
  process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()):
  ['http://localhost:8081'];
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coffeeshop';
const PORT = process.env.PORT || 3000;

if (!JWT_SECRET) 
  throw new Error('JWT_SECRET is not defined in the environment variables. Please set it in your .env file.');

if (NODE_ENV === 'development') {
  console.log('==========================');
  console.log(`Environment     : ${NODE_ENV}`);
  console.log(`MongoDB         : ${MONGODB_URI}`);
  console.log(`Allowed Origins : ${CORS_ORIGINS.join(', ')}`);
  console.log(`Port            : ${PORT}`);
  console.log('==========================');
}

//====================//
// CONNECT TO MONGODB //
//====================//

mongoose.connect(MONGODB_URI).then(() => {
  console.log('Connected to MongoDB');
  startServer();
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error);
  process.exit(1);
});

//==================================//
// INITIALIZE EXPRESS AND SOCKET.IO //
//==================================//

const startServer = () => {
  const app = express();
  app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
  app.use(express.json());

  // TODO: Add routes setup here
  // Import route folder's index.js and use an initializer function.
  routes.initializeRoutes(app);

  app.get('/health', (req, res) => {
    res.sendStatus(200);
  });

  const server = http.createServer(app);

  // TODO: Add socket.io setup here
  // Import socket folder's index.js and use an initializer function.
  // Example: const initializeSocket = require('./socket'); initializeSocket(server);

  // START SERVER //

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}