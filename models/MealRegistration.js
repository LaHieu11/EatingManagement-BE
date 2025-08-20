const mongoose = require('mongoose');

const mealRegistrationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmed: { type: Boolean, default: false },
  isCancel: { type: Boolean, default: true }, // true: đăng ký hủy ăn
  date: { type: Date, required: true },
  type: { type: String, enum: ['lunch', 'dinner'], required: true },
  createdAt: { type: Date, default: Date.now },
  guestName: { type: String }, // Tên khách ngoài hệ thống
  guestCount: { type: Number, default: 0 }, // Số suất ăn ngoài hệ thống
  guestReason: { type: String }, // Lý do đăng ký thêm suất
  guestBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Ai đăng ký suất ngoài hệ thống
  isGuest: { type: Boolean, default: false }, // Đánh dấu là suất ngoài hệ thống
});

module.exports = mongoose.model('MealRegistration', mealRegistrationSchema); 