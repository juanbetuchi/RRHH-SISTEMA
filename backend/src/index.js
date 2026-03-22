require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const vacantesRouter = require('./routes/vacantes');
const postulantesRouter = require('./routes/postulantes');
const rankingRouter = require('./routes/ranking');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ── Rutas ───────────────────────────────────────────────────────────────────
app.use('/api/vacantes', vacantesRouter);
app.use('/api/postulantes', postulantesRouter);
app.use('/api/ranking', rankingRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
    timestamp: new Date().toISOString()
  });
});

// ── Conexión MongoDB ────────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Atlas conectado');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}

start();
