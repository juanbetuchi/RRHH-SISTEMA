const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean);

const TOP_N = 15;

async function callGemini(prompt) {
  let lastError = null;
  for (const key of GEMINI_KEYS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await res.json();
      if (data.error) {
        const code = data.error.code || data.error.status;
        if (code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'QUOTA_EXCEEDED') {
          console.log('Key agotada, rotando...');
          lastError = new Error(data.error.message);
          continue;
        }
        throw new Error(data.error.message);
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Respuesta vacía de Gemini');
      return text;
    } catch (e) {
      lastError = e;
      if (e.message?.includes('quota') || e.message?.includes('429')) continue;
      throw e;
    }
  }
  throw lastError || new Error('Todas las API Keys agotaron su cuota');
}

async function analizarPostulanteIncremental(postulante, vacante) {
  const top15 = await Postulante.find({
    vacanteId: vacante._id,
    puntajeIA: { $ne: null },
    _id: { $ne: postulante._id }
  }).sort({ puntajeIA: -1 }).limit(TOP_N);

  const respuestasText = Object.entries(Object.fromEntries(postulante.respuestas || new Map()))
    .map(([k, v]) => `  - ${k}: ${v}`).join('\n');

  const top15Text = top15.length > 0
    ? top15.map((p, i) => {
        const r = Object.fromEntries(p.respuestas || new Map());
        const resp = Object.entries(r).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `${i+1}. ${p.nombre} (puntaje actual: ${p.puntajeIA}) — ${resp}`;
      }).join('\n')
    : 'Aún no hay candidatos rankeados.';

  const prompt = `Sos un especialista en Recursos Humanos. Evaluá este postulante para la vacante de "${vacante.nombre}".

DESCRIPCIÓN: ${vacante.descripcion || 'No especificada'}
REQUISITOS: ${vacante.requisitos || 'No especificados'}

NUEVO POSTULANTE: ${postulante.nombre}
${respuestasText}

TOP 15 ACTUAL DE ESTA VACANTE:
${top15Text}

Analizá al nuevo postulante y asignale un puntaje del 1 al 100.

Respondé ÚNICAMENTE con JSON válido sin markdown:
{
  "puntaje": 85,
  "evaluacion": "evaluación en 1-2 oraciones",
  "fortalezas": ["fortaleza 1", "fortaleza 2"],
  "debilidades": ["debilidad 1"],
  "entraAlTop15": true
}

"entraAlTop15" debe ser true si su puntaje es mayor al peor del Top 15 actual o si hay menos de 15 rankeados.`;

  const text = await callGemini(prompt);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ── RUTAS ── (el orden importa: rutas específicas antes que las genéricas)

// GET /api/ranking/top/:vacanteId — obtener Top 15 actual
router.get('/top/:vacanteId', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    const top = await Postulante.find({
      vacanteId: req.params.vacanteId,
      puntajeIA: { $ne: null }
    }).select('-cvData').sort({ puntajeIA: -1 }).limit(TOP_N);
    res.json({ vacante: vacante.nombre, total: top.length, ranking: top });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ranking/top/:vacanteId — obtener Top 15 actual
router.get('/top/:vacanteId', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    const top = await Postulante.find({
      vacanteId: req.params.vacanteId,
      puntajeIA: { $ne: null }
    }).select('-cvData').sort({ puntajeIA: -1 }).limit(TOP_N);

    res.json({ vacante: vacante.nombre, total: top.length, ranking: top });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ranking/analizar/:postulanteId — análisis incremental automático
router.post('/analizar/:postulanteId', async (req, res) => {
  try {
    const postulante = await Postulante.findById(req.params.postulanteId);
    if (!postulante) return res.status(404).json({ error: 'Postulante no encontrado' });
    const vacante = await Vacante.findById(postulante.vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    const resultado = await analizarPostulanteIncremental(postulante, vacante);
    await Postulante.findByIdAndUpdate(postulante._id, {
      puntajeIA: resultado.puntaje,
      evaluacionIA: resultado.evaluacion
    });

    if (resultado.entraAlTop15) {
      const countTop = await Postulante.countDocuments({
        vacanteId: vacante._id,
        puntajeIA: { $ne: null }
      });
      if (countTop > TOP_N) {
        const peor = await Postulante.findOne({
          vacanteId: vacante._id,
          puntajeIA: { $ne: null }
        }).sort({ puntajeIA: 1 }).limit(1);
        if (peor && peor._id.toString() !== postulante._id.toString()) {
          await Postulante.findByIdAndUpdate(peor._id, { puntajeIA: null, evaluacionIA: null });
        }
      }
    }
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error análisis incremental:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ranking/:vacanteId — análisis completo manual
router.post('/:vacanteId', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });
    const postulantes = await Postulante.find({ vacanteId: req.params.vacanteId }).select('-cvData');
    if (!postulantes.length) return res.status(400).json({ error: 'No hay postulantes' });

    const postulantesText = postulantes.map((p, i) => {
      const resp = Object.entries(Object.fromEntries(p.respuestas || new Map()))
        .map(([k, v]) => `  - ${k}: ${v}`).join('\n');
      return `POSTULANTE ${i+1} (ID: ${p._id}):\nNombre: ${p.nombre}\n${resp}`;
    }).join('\n\n');

    const prompt = `Sos un especialista en Recursos Humanos. Analizá TODOS los postulantes para "${vacante.nombre}".

DESCRIPCIÓN: ${vacante.descripcion || 'No especificada'}
REQUISITOS: ${vacante.requisitos || 'No especificados'}

POSTULANTES:
${postulantesText}

Generá un ranking completo ordenado de mayor a menor puntaje. Devolvé ÚNICAMENTE JSON válido sin markdown:
{
  "resumen": "análisis general en 2 oraciones",
  "ranking": [
    {
      "id": "ID del postulante",
      "nombre": "nombre",
      "puntaje": 85,
      "evaluacion": "evaluación en 1-2 oraciones",
      "fortalezas": ["fortaleza 1"],
      "debilidades": ["debilidad 1"]
    }
  ]
}`;

    const text = await callGemini(prompt);
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const resultado = JSON.parse(clean);

    for (const r of resultado.ranking) {
      await Postulante.findByIdAndUpdate(r.id, {
        puntajeIA: r.puntaje,
        evaluacionIA: r.evaluacion
      });
    }
    res.json({ vacante: { nombre: vacante.nombre, id: vacante._id }, ...resultado });
  } catch (err) {
    console.error('Error ranking completo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.analizarPostulanteIncremental = analizarPostulanteIncremental;
module.exports.callGemini = callGemini;