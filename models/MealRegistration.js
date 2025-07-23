const mongoose = require('mongoose');

const mealRegistrationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmed: { type: Boolean, default: false },
  isCancel: { type: Boolean, default: true }, // true: đăng ký hủy ăn
  date: { type: Date, required: true },
  type: { type: String, enum: ['lunch', 'dinner'], required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MealRegistration', mealRegistrationSchema); 