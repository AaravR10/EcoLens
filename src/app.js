import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Middleware
app.use(express.json());
app.use(cors());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, '../public')));

// Anonymous JWT Auth Middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Invalid token, treat as anonymous
      req.user = null;
    }
  }

  // If no valid token, generate a new anonymous session token
  if (!req.user) {
    req.isNewSession = true; // Flag to indicate a new session token should be baked into response
  }

  next();
});

// Routes
app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(`EcoLens API Gateway listening on port ${PORT}`);
});
