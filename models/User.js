const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true },
  isPhoneVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema); 