const express = require('express');
const router = express.Router();
const Vacante = require('../models/Vacante');
const Postulante = require('../models/Postulante');
const { google } = require('googleapis');

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  return google.drive({ version: 'v3', auth });
}

router.get('/', async (req, res) => {
  try {
    const vacantes = await Vacante.find({ activa: true }).sort({ createdAt: -1 });
    res.json(vacantes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.id);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    res.json(vacante);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, area, descripcion, requisitos } = req.body;
    if (!nombre || !area) return res.status(400).json({ error: 'nombre y area son requeridos' });
    const vacante = new Vacante({ nombre, area, descripcion, requisitos });
    await vacante.save();
    res.status(201).json(vacante);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/cuestionario', async (req, res) => {
  try {
    const { preguntas } = req.body;
    if (!Array.isArray(preguntas)) return res.status(400).json({ error: 'preguntas debe ser un array' });
    const vacante = await Vacante.findByIdAndUpdate(req.params.id, { cuestionario: preguntas }, { new: true });
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    res.json(vacante);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const vacanteId = req.params.id;
    const postulantes = await Postulante.find({ vacanteId });
    const drive = getDriveClient();
    for (const p of postulantes) {
      if (p.cvDriveId) {
        try { await drive.files.delete({ fileId: p.cvDriveId }); } catch (e) {}
      }
    }
    await Postulante.deleteMany({ vacanteId });
    await Vacante.findByIdAndDelete(vacanteId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;