const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');
const https = require('https');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/postulantes
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

// GET /api/postulantes/:id/cv — proxy para descargar CV
router.get('/:id/cv', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante || !postulante.cvUrl) {
      return res.status(404).json({ error: 'CV no encontrado' });
    }
    const nombre = (postulante.cvNombre || 'cv.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Content-Type', nombre.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf');
    https.get(postulante.cvUrl, (stream) => {
      stream.pipe(res);
    }).on('error', (e) => {
      res.status(500).json({ error: 'Error descargando CV: ' + e.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/postulantes — guardar postulante con CV opcional
router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const { vacanteId, nombre, respuestas } = req.body;
    if (!vacanteId || !nombre) {
      return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });
    }
    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    let cvUrl = null;
    let cvPublicId = null;
    let cvNombre = null;

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'rrhh-cvs',
            public_id: `cv_${Date.now()}_${nombre.replace(/\s+/g, '_')}`,
            format: req.file.originalname.endsWith('.docx') ? 'docx' : 'pdf',
            access_mode: 'public',
            type: 'upload'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      cvUrl = uploadResult.secure_url;
      cvPublicId = uploadResult.public_id;
      cvNombre = req.file.originalname;
    }

    const respuestasObj = typeof respuestas === 'string' ? JSON.parse(respuestas) : respuestas;
    const postulante = new Postulante({ vacanteId, nombre, respuestas: respuestasObj, cvUrl, cvPublicId, cvNombre });
    await postulante.save();
    res.status(201).json({ ok: true, id: postulante._id });
  } catch (err) {
    console.error('Error guardando postulante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/postulantes/:id
router.delete('/:id', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante) return res.status(404).json({ error: 'Postulante no encontrado' });
    if (postulante.cvPublicId) {
      try {
        await cloudinary.uploader.destroy(postulante.cvPublicId, { resource_type: 'raw' });
      } catch (e) {
        console.error('Error eliminando CV:', e.message);
      }
    }
    await Postulante.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// POST /api/postulantes — guardar postulante con CV opcional
router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const { vacanteId, nombre, respuestas } = req.body;
    if (!vacanteId || !nombre) {
      return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });
    }
    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    let cvUrl = null;
    let cvPublicId = null;
    let cvNombre = null;

    // Si hay CV, subirlo a Cloudinary
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'rrhh-cvs',
            public_id: `cv_${Date.now()}_${nombre.replace(/\s+/g, '_')}`,
            format: req.file.originalname.endsWith('.docx') ? 'docx' : 'pdf',
            access_mode: 'public',
            type: 'upload'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      cvUrl = uploadResult.secure_url;
      cvPublicId = uploadResult.public_id;
      cvNombre = req.file.originalname;
    }

    const respuestasObj = typeof respuestas === 'string' ? JSON.parse(respuestas) : respuestas;
    const postulante = new Postulante({ vacanteId, nombre, respuestas: respuestasObj, cvUrl, cvPublicId, cvNombre });
    await postulante.save();
    res.status(201).json({ ok: true, id: postulante._id });
  } catch (err) {
    console.error('Error guardando postulante:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/postulantes/:id — eliminar postulante individual
router.delete('/:id', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante) return res.status(404).json({ error: 'Postulante no encontrado' });
    if (postulante.cvPublicId) {
      try {
        await cloudinary.uploader.destroy(postulante.cvPublicId, { resource_type: 'raw' });
      } catch (e) {
        console.error('Error eliminando CV:', e.message);
      }
    }
    await Postulante.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;