const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');

// GET /api/postulantes?vacanteId=xxx — listar postulantes
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.vacanteId) filtro.vacanteId = req.query.vacanteId;
    const postulantes = await Postulante.find(filtro)
      .populate('vacanteId', 'nombre area')
      .sort({ createdAt: -1 });
    res.json(postulantes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/postulantes — guardar respuestas de un postulante
router.post('/', async (req, res) => {
  try {
    const { vacanteId, nombre, respuestas } = req.body;
    if (!vacanteId || !nombre) {
      return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });
    }
    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    const postulante = new Postulante({ vacanteId, nombre, respuestas });
    await postulante.save();
    res.status(201).json({ ok: true, id: postulante._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/postulantes/stats — estadísticas generales
router.get('/stats', async (req, res) => {
  try {
    const total = await Postulante.countDocuments();
    const porVacante = await Postulante.aggregate([
      { $group: { _id: '$vacanteId', count: { $sum: 1 } } }
    ]);
    res.json({ total, porVacante });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
