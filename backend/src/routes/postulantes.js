const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');
const multer = require('multer');
const { google } = require('googleapis');
const { Readable } = require('stream');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

// GET /api/postulantes/:id/cv — redirige al CV en Drive
router.get('/:id/cv', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante || !postulante.cvDriveId) {
      return res.status(404).send('CV no encontrado');
    }
    // Redirigir al link de visualización de Google Drive
    const url = `https://drive.google.com/file/d/${postulante.cvDriveId}/view`;
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/postulantes
router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const { vacanteId, nombre, respuestas } = req.body;
    if (!vacanteId || !nombre) {
      return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });
    }
    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    let cvUrl = null;
    let cvDriveId = null;
    let cvNombre = null;

    if (req.file) {
      const drive = getDriveClient();
      const stream = Readable.from(req.file.buffer);
      const driveRes = await drive.files.create({
        requestBody: {
          name: `${nombre}_${Date.now()}_${req.file.originalname}`,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: req.file.mimetype,
          body: stream
        },
        fields: 'id, webViewLink'
      });

      // Hacer el archivo público para que se pueda ver
      await drive.permissions.create({
        fileId: driveRes.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      cvDriveId = driveRes.data.id;
      cvUrl = driveRes.data.webViewLink;
      cvNombre = req.file.originalname;
    }

    const respuestasObj = typeof respuestas === 'string' ? JSON.parse(respuestas) : respuestas;
    const postulante = new Postulante({
      vacanteId, nombre, respuestas: respuestasObj,
      cvUrl, cvDriveId, cvNombre
    });
    await postulante.save();
    res.status(201).json({ ok: true, id: postulante._id });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/postulantes/:id
router.delete('/:id', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante) return res.status(404).json({ error: 'No encontrado' });
    if (postulante.cvDriveId) {
      try {
        const drive = getDriveClient();
        await drive.files.delete({ fileId: postulante.cvDriveId });
      } catch (e) {
        console.error('Error eliminando de Drive:', e.message);
      }
    }
    await Postulante.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

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

// GET /api/postulantes/:id/cv — descargar CV
router.get('/:id/cv', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id).select('cvData cvNombre cvMimeType');
    if (!postulante || !postulante.cvData) {
      return res.status(404).send('CV no encontrado');
    }
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
    if (!vacanteId || !nombre) {
      return res.status(400).json({ error: 'vacanteId y nombre son requeridos' });
    }
    const vacante = await Vacante.findById(vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    let cvData = null;
    let cvNombre = null;
    let cvMimeType = null;

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
    res.status(201).json({ ok: true, id: postulante._id });
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

// GET /api/postulantes/:id/cv — proxy descarga CV desde Cloudinary
router.get('/:id/cv', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.id);
    if (!postulante || !postulante.cvPublicId) {
      return res.status(404).send('CV no encontrado');
    }
    // Generar URL firmada con expiración
    const url = cloudinary.utils.private_download_url(
      postulante.cvPublicId,
      '',
      {
        resource_type: 'raw',
        attachment: true,
        expires_at: Math.floor(Date.now() / 1000) + 300
      }
    );
    res.redirect(url);
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
      const ext = req.file.originalname.endsWith('.docx') ? 'docx' : 'pdf';
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'rrhh-cvs',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
            format: ext
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