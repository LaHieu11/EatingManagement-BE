var express = require('express');
var router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const nodemailer = require('nodemailer');

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

// Hàm gửi OTP qua email
async function sendOTPEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Mã xác thực OTP',
    text: `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`,
  };
  await transporter.sendMail(mailOptions);
}

// Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, email, phone, gender } = req.body;
    const existingUser = await User.findOne({ $or: [{ username }, { email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username, email hoặc số điện thoại đã tồn tại' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Sinh OTP 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
    const user = new User({ username, password: hashedPassword, fullName, email, phone, gender, otp, otpExpires });
    await user.save();
    
    // Gửi OTP qua email
    await sendOTPEmail(email, otp);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Xác thực OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.otp || !user.otpExpires || user.otp !== otp || user.otpExpires < new Date()) {
    return res.status(400).json({ message: 'OTP không đúng hoặc đã hết hạn' });
  }
  user.otp = undefined;
  user.otpExpires = undefined;
  user.isActive = true;
  await user.save();
  res.json({ message: 'Xác thực OTP thành công, tài khoản đã được kích hoạt' });
});

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Sai username hoặc password' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Sai username hoặc password' });
    }
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: user.role, fullName: user.fullName, email: user.email, gender: user.gender },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1d' }
    );
    res.json({ token, user: { username: user.username, fullName: user.fullName, email: user.email, role: user.role, gender: user.gender } });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Lấy danh sách user (admin)
router.get('/list', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Cập nhật thông tin cá nhân (user)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const user = await User.findByIdAndUpdate(req.user.userId, { fullName, email }, { new: true, fields: '-password' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Đổi mật khẩu (user)
router.put('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User không tồn tại' });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu cũ không đúng' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Gửi lại OTP
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });
  // Kiểm tra thời gian gửi lại OTP (tối thiểu 1 phút)
  if (user.otpExpires && user.otpExpires > new Date(Date.now() - 9 * 60 * 1000)) {
    return res.status(400).json({ message: 'Vui lòng đợi ít nhất 1 phút trước khi gửi lại OTP' });
  }
  // Sinh OTP mới
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();
  await sendOTPEmail(user.email, otp);
  res.json({ message: 'Đã gửi lại OTP thành công' });
});

// Xem log hoạt động (admin)
router.get('/activity-log', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const logs = await ActivityLog.find().populate('user', 'username fullName email').sort({ createdAt: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Quên mật khẩu - Gửi OTP về email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng với email này' });
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
  user.otp = otp;
  user.otpExpires = otpExpires;
  await user.save();
  await sendOTPEmail(email, otp);
  res.json({ message: 'Đã gửi OTP về email' });
});

// Quên mật khẩu - Xác thực OTP và đổi mật khẩu
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.otp || !user.otpExpires || user.otp !== otp || user.otpExpires < new Date()) {
    return res.status(400).json({ message: 'OTP không đúng hoặc đã hết hạn' });
  }
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();
  res.json({ message: 'Đổi mật khẩu thành công' });
});

module.exports = router;
