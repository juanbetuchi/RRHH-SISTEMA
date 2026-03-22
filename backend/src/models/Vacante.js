const mongoose = require('mongoose');

const PreguntaSchema = new mongoose.Schema({
  texto: { type: String, required: true },
  tipo: { type: String, enum: ['texto', 'numero', 'si_no'], default: 'texto' }
}, { _id: true });

const VacanteSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  area: { type: String, required: true },
  descripcion: { type: String, default: '' },
  requisitos: { type: String, default: '' },
  cuestionario: [PreguntaSchema],
  activa: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Vacante', VacanteSchema);
