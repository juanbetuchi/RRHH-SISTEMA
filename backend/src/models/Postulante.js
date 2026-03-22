const mongoose = require('mongoose');

const PostulanteSchema = new mongoose.Schema({
  vacanteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vacante',
    required: true
  },
  nombre: { type: String, required: true, trim: true },
  respuestas: {
    type: Map,
    of: String,
    default: {}
  },
  puntajeIA: { type: Number, default: null },
  evaluacionIA: { type: String, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('Postulante', PostulanteSchema);
