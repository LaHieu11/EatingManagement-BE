var express = require('express');
var router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');
const { requireAuth, requireRole } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell } = require('docx');
const Meal = require('../models/Meal');
const MealRegistration = require('../models/MealRegistration');

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
    socketTimeout: 10000,
    connectionTimeout: 10000,
  });
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Mã xác thực OTP',
    text: `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`,
  };
  console.log('Chuẩn bị gửi OTP qua email:', email, otp);
  try {
    await transporter.sendMail(mailOptions);
    console.log('Đã gửi OTP qua email:', email);
  } catch (err) {
    console.error('Lỗi gửi OTP qua email:', err);
    throw err;
  }
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
    // Trả response về FE
    res.status(201).json({ message: 'Đăng ký thành công! Vui lòng nhập OTP gửi về email.' });
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

// API lấy log hoạt động, lọc theo userId, tuần, tháng, ngày
router.get('/activity-log', async (req, res) => {
  try {
    const { userId, mode, year, month, week, date } = req.query;
    let filter = {};
    if (userId) filter.user = userId;
    let startDate, endDate;
    const now = new Date();
    if (mode === 'month' && month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      startDate = new Date(y, m, 1);
      endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (mode === 'week' && week && year) {
      const y = parseInt(year);
      const w = parseInt(week);
      const firstDayOfYear = new Date(y, 0, 1);
      const days = (w - 1) * 7 + (firstDayOfYear.getDay() === 0 ? 1 : 0);
      startDate = new Date(y, 0, 1 + days);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (mode === 'day' && date) {
      startDate = new Date(date);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    }
    if (startDate && endDate) {
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }
    // Chỉ lấy log đăng ký ăn/hủy ăn (theo action thực tế trong DB)
    filter.action = { $in: ['cancel_meal', 'register_meal'] };
    const logs = await ActivityLog.find(filter).populate('user', 'fullName email username').sort({ createdAt: -1 });
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

// API xuất báo cáo
router.get('/export-report', async (req, res) => {
  try {
    const { type = 'excel', mode = 'month', month, year, week, userId } = req.query;
    let startDate, endDate;
    const now = new Date();
    if (mode === 'month') {
      const m = month ? parseInt(month) - 1 : now.getMonth();
      const y = year ? parseInt(year) : now.getFullYear();
      startDate = new Date(y, m, 1);
      endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
    } else if (mode === 'week') {
      // Tính tuần theo ISO (thứ 2 đầu tuần)
      const y = year ? parseInt(year) : now.getFullYear();
      const w = week ? parseInt(week) : 1;
      const firstDayOfYear = new Date(y, 0, 1);
      const days = (w - 1) * 7 + (firstDayOfYear.getDay() === 0 ? 1 : 0);
      startDate = new Date(y, 0, 1 + days);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    }
    // Lấy danh sách user chỉ role 'user'
    const users = await User.find({ role: 'user' }, 'fullName phone email');
    // Lấy danh sách đăng ký suất ăn trong khoảng thời gian
    let filter = { date: { $gte: startDate, $lte: endDate } };
    if (userId) filter.user = userId;
    const regs = await MealRegistration.find(filter).populate('user');
    // Thống kê
    // Ngày tạo báo cáo
    const reportDate = new Date();
    // Tính tổng số ngày từ đầu tháng đến ngày xuất báo cáo
    let totalDays = 0;
    if (mode === 'month' || mode === 'personal') {
      const y = year ? parseInt(year) : now.getFullYear();
      const m = month ? parseInt(month) - 1 : now.getMonth();
      const today = now;
      const firstDay = new Date(y, m, 1);
      totalDays = Math.floor((today - firstDay) / (1000 * 60 * 60 * 24)) + 1;
    }
    const report = users.map(u => {
      const userRegs = regs.filter(r => r.user && r.user._id.equals(u._id));
      const canceled = userRegs.filter(r => r.isCancel).length;
      const eaten = totalDays - canceled;
      const total = eaten * 30000;
      return {
        name: u.fullName,
        phone: u.phone,
        email: u.email,
        eaten,
        canceled,
        total
      };
    });
    if (type === 'excel') {
      // Xuất file Excel
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Báo cáo');
      sheet.columns = [
        { header: 'Tên', key: 'name', width: 20 },
        { header: 'Số điện thoại', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Số suất ăn', key: 'eaten', width: 12 },
        { header: 'Số suất hủy', key: 'canceled', width: 12 },
        { header: 'Tổng tiền (VNĐ)', key: 'total', width: 15 },
      ];
      sheet.addRows(report);
      sheet.addRow([]);
      sheet.addRow(['Ngày tạo báo cáo:', reportDate.toLocaleString('vi-VN')]);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=baocao.xlsx');
      await workbook.xlsx.write(res);
      res.end();
      return;
    }
    if (type === 'pdf') {
      // Xuất file PDF với font Unicode
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const fontPath = require('path').join(__dirname, '../public/fonts/DejaVuSans.ttf');
      doc.registerFont('DejaVu', fontPath);
      doc.font('DejaVu');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=baocao.pdf');
      doc.fontSize(18).text('Báo cáo suất ăn', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12);
      doc.text('Ngày tạo báo cáo: ' + reportDate.toLocaleString('vi-VN'));
      doc.moveDown();
      const headers = ['Tên', 'Số điện thoại', 'Email', 'Số suất ăn', 'Số suất hủy', 'Tổng tiền (VNĐ)'];
      doc.text(headers.join(' | '));
      doc.moveDown(0.5);
      report.forEach(r => {
        doc.text(`${r.name} | ${r.phone} | ${r.email} | ${r.eaten} | ${r.canceled} | ${r.total}`);
      });
      doc.end();
      doc.pipe(res);
      return;
    }
    if (type === 'word') {
      // Xuất file Word
      const tableRows = [
        new TableRow({
          children: [
            'Tên', 'Số điện thoại', 'Email', 'Số suất ăn', 'Số suất hủy', 'Tổng tiền (VNĐ)'
          ].map(h => new TableCell({ children: [new Paragraph(h)] }))
        }),
        ...report.map(r => new TableRow({
          children: [
            r.name, r.phone, r.email, r.eaten.toString(), r.canceled.toString(), r.total.toString()
          ].map(val => new TableCell({ children: [new Paragraph(val)] }))
        })),
        new TableRow({
          children: [new TableCell({ children: [new Paragraph('Ngày tạo báo cáo: ' + reportDate.toLocaleString('vi-VN'))], columnSpan: 6 })]
        })
      ];
      const doc = new Document({
        sections: [{ children: [
          new Paragraph({ text: 'Báo cáo suất ăn', heading: 'Heading1' }),
          new Table({ rows: tableRows })
        ]}]
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=baocao.docx');
      const buffer = await Packer.toBuffer(doc);
      res.end(buffer);
      return;
    }
    res.status(501).json({ message: 'Chỉ mới hỗ trợ xuất Excel, PDF/Word, PDF và Word đã được bổ sung.' });
  } catch (err) {
    console.error('Lỗi xuất báo cáo:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API trả về user role 'user'
router.get('/only-users', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }, 'fullName email username _id');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;
