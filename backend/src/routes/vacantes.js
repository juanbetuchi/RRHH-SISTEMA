const express = require('express');
const router = express.Router();
const Vacante = require('../models/Vacante');
const Postulante = require('../models/Postulante');
const cloudinary = require('cloudinary').v2;

// GET /api/vacantes
router.get('/', async (req, res) => {
  try {
    const vacantes = await Vacante.find({ activa: true }).sort({ createdAt: -1 });
    res.json(vacantes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vacantes/:id
router.get('/:id', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.id);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    res.json(vacante);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vacantes
router.post('/', async (req, res) => {
  try {
    const { nombre, area, descripcion, requisitos } = req.body;
    if (!nombre || !area) return res.status(400).json({ error: 'nombre y area son requeridos' });
    const vacante = new Vacante({ nombre, area, descripcion, requisitos });
    await vacante.save();
    res.status(201).json(vacante);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vacantes/:id/cuestionario
router.put('/:id/cuestionario', async (req, res) => {
  try {
    const { preguntas } = req.body;
    if (!Array.isArray(preguntas)) return res.status(400).json({ error: 'preguntas debe ser un array' });
    const vacante = await Vacante.findByIdAndUpdate(
      req.params.id,
      { cuestionario: preguntas },
      { new: true }
    );
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    res.json(vacante);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vacantes/:id — elimina vacante + postulantes + CVs de Cloudinary
router.delete('/:id', async (req, res) => {
  try {
    const vacanteId = req.params.id;
    const postulantes = await Postulante.find({ vacanteId });
    for (const p of postulantes) {
      if (p.cvPublicId) {
        try {
          await cloudinary.uploader.destroy(p.cvPublicId, { resource_type: 'raw' });
        } catch (e) {
          console.error('Error eliminando CV de Cloudinary:', e.message);
        }
      }
    }
    await Postulante.deleteMany({ vacanteId });
    await Vacante.findByIdAndDelete(vacanteId);
    res.json({ ok: true, mensaje: 'Vacante y postulantes eliminados correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;