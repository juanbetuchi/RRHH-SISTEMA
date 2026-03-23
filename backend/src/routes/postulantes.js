const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/jpg'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo PDF, Word o imágenes'));
  }
});

// GET /api/postulantes
router.get('/', async (req, res) => {
  try {
    const filtro = {};
    if (req.query.vacanteId) filtro.vacanteId = req.query.vacanteId;
    const postulantes = await Postulante.find(filtro)
      .select('-cvData')
      .populate('vacanteId', 'nombre area')
      .sort({ createdAt: -1 });
    res.json(postulantes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/postulantes/:id/cv
router.get('/:id/cv', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id).select('cvData cvNombre cvMimeType');
    if (!postulante || !postulante.cvData) return res.status(404).send('CV no encontrado');
    const buffer = Buffer.from(postulante.cvData, 'base64');
    const nombre = (postulante.cvNombre || 'cv.pdf').replace(/[^a-zA-Z0-9._\-() ]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Content-Type', postulante.cvMimeType || 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/postulantes
router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const { vacanteId, nombre, respuestas } = req.body;
    if (!vacanteId || !nombre) return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });

    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    let cvData = null, cvNombre = null, cvMimeType = null;
    if (req.file) {
      cvData = req.file.buffer.toString('base64');
      cvNombre = req.file.originalname;
      cvMimeType = req.file.mimetype;
    }

    const respuestasObj = typeof respuestas === 'string' ? JSON.parse(respuestas) : respuestas;
    const postulante = new Postulante({
      vacanteId, nombre, respuestas: respuestasObj,
      cvData, cvNombre, cvMimeType,
      cvUrl: cvData ? 'tiene_cv' : null
    });
    await postulante.save();

    // Responder inmediatamente al postulante
    res.status(201).json({ ok: true, id: postulante._id });

    // Análisis automático — se ejecuta después de responder
    try {
      const { analizarPostulanteIncremental } = require('./ranking');
      const resultado = await analizarPostulanteIncremental(postulante, vacante);
      console.log(`✅ Análisis automático completado: ${nombre} — Puntaje: ${resultado.puntaje}`);
    } catch (e) {
      console.error(`⚠ Error análisis automático (${nombre}):`, e.message);
    }

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/postulantes/:id
router.delete('/:id', async (req, res) => {
  try {
    await Postulante.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;