const express = require('express');
const router = express.Router();
const Postulante = require('../models/Postulante');
const Vacante = require('../models/Vacante');

// POST /api/ranking/:vacanteId — analizar postulantes con Gemini
router.post('/:vacanteId', async (req, res) => {
  try {
    const vacante = await Vacante.findById(req.params.vacanteId);
    if (!vacante) return res.status(404).json({ error: 'Vacante no encontrada' });

    const postulantes = await Postulante.find({ vacanteId: req.params.vacanteId });
    if (postulantes.length === 0) {
      return res.status(400).json({ error: 'No hay postulantes para analizar' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('tu_key')) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en .env' });
    }

    // Armar el prompt con los datos
    const postulantesText = postulantes.map((p, i) => {
      const resp = Object.entries(Object.fromEntries(p.respuestas || new Map()))
        .map(([k, v]) => `  - ${k}: ${v}`)
        .join('\n');
      return `POSTULANTE ${i + 1} (ID: ${p._id}):\nNombre: ${p.nombre}\n${resp}`;
    }).join('\n\n');

    const prompt = `Sos un especialista en Recursos Humanos. Analizá los postulantes para la vacante de "${vacante.nombre}".

DESCRIPCIÓN: ${vacante.descripcion || 'No especificada'}
REQUISITOS CLAVE: ${vacante.requisitos || 'No especificados'}

POSTULANTES:
${postulantesText}

Analizá cada postulante y devolvé un ranking ordenado de mayor a menor puntaje.

Respondé ÚNICAMENTE con un JSON válido, sin markdown, sin texto adicional:
{
  "resumen": "análisis del pool de candidatos en 2 oraciones",
  "ranking": [
    {
      "id": "ID exacto del postulante",
      "nombre": "nombre",
      "puntaje": 85,
      "evaluacion": "evaluación objetiva en 1-2 oraciones",
      "fortalezas": ["fortaleza 1", "fortaleza 2"],
      "debilidades": ["debilidad 1"]
    }
  ]
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiData.error) throw new Error(geminiData.error.message);

    let text = geminiData.candidates[0].content.parts[0].text;
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const resultado = JSON.parse(text);

    // Guardar puntaje en cada postulante
    for (const r of resultado.ranking) {
      await Postulante.findByIdAndUpdate(r.id, {
        puntajeIA: r.puntaje,
        evaluacionIA: r.evaluacion
      });
    }

    res.json({
      vacante: { nombre: vacante.nombre, id: vacante._id },
      ...resultado
    });

  } catch (err) {
    console.error('Error en ranking:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
