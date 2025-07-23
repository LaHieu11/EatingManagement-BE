const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  type: { type: String, enum: ['lunch', 'dinner'], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Meal', mealSchema); 