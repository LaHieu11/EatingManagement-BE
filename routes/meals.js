const express = require('express');
const router = express.Router();
const Meal = require('../models/Meal');
const MealRegistration = require('../models/MealRegistration');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');
const { requireAuth, requireRole } = require('../middleware/auth');

// Middleware xác thực JWT
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

// Tạo bữa ăn mới (admin)
router.post('/create', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { date, type } = req.body;
    const meal = new Meal({ date, type });
    await meal.save();
    await ActivityLog.create({ user: req.user.userId, action: 'create_meal', detail: `Tạo bữa ăn mới: ${type} ngày ${new Date(date).toISOString().slice(0,10)}` });
    res.status(201).json(meal);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Đăng ký hủy ăn (user)
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { date, type } = req.body;
    if (!date || !type) return res.status(400).json({ message: 'Thiếu thông tin ngày hoặc loại bữa' });
    const mealTime = new Date(date); // date đã là UTC ISO string
    // Tìm trong khoảng 00:00 - 23:59:59.999 UTC của ngày đó
    const start = new Date(Date.UTC(mealTime.getUTCFullYear(), mealTime.getUTCMonth(), mealTime.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(mealTime.getUTCFullYear(), mealTime.getUTCMonth(), mealTime.getUTCDate(), 23, 59, 59, 999));
    console.log('[DEBUG] Đăng ký hủy ăn:', { user: req.user.userId, type, mealTime, start, end });
    // Kiểm tra đã đăng ký hủy chưa
    const existing = await MealRegistration.findOne({
      user: req.user.userId,
      type,
      date: { $gte: start, $lte: end },
      isCancel: true
    });
    console.log('[DEBUG] Existing cancel:', existing);
    if (existing) return res.status(400).json({ message: 'Bạn đã đăng ký hủy ăn cho bữa này' });
    const reg = new MealRegistration({ user: req.user.userId, date: mealTime, type, isCancel: true });
    await reg.save();
    await ActivityLog.create({ user: req.user.userId, action: 'cancel_meal', detail: `Đăng ký hủy ăn ${type} ${mealTime.toISOString().slice(0,10)}` });
    res.status(201).json(reg);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Bỏ đăng ký hủy ăn (user)
router.delete('/cancel/:registrationId', requireAuth, async (req, res) => {
  try {
    const reg = await MealRegistration.findById(req.params.registrationId);
    if (!reg) return res.status(404).json({ message: 'Không tìm thấy đăng ký hủy' });
    if (reg.user.toString() !== req.user.userId) return res.status(403).json({ message: 'Không có quyền thao tác' });
    // Kiểm tra giờ chốt
    const now = new Date();
    const mealTime = new Date(reg.date);
    const cutoff = reg.type === 'lunch'
      ? new Date(mealTime.getFullYear(), mealTime.getMonth(), mealTime.getDate(), 8, 30)
      : new Date(mealTime.getFullYear(), mealTime.getMonth(), mealTime.getDate(), 14, 30);
    if (now > cutoff) return res.status(400).json({ message: 'Đã quá giờ bỏ đăng ký hủy ăn' });
    await reg.deleteOne();
    await ActivityLog.create({ user: req.user.userId, action: 'uncancel_meal', detail: `Bỏ đăng ký hủy ăn ${reg.type} ${mealTime.toISOString().slice(0,10)}` });
    res.json({ message: 'Đã bỏ đăng ký hủy ăn' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Lấy danh sách đăng ký suất ăn cho 1 bữa (admin)
router.get('/registrations/:mealId', requireAuth, requireRole(['kitchen', 'admin']), async (req, res) => {
  try {
    const regs = await MealRegistration.find({ meal: req.params.mealId }).populate('user', 'username fullName email');
    res.json(regs);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Tổng hợp số suất ăn của từng user trong tháng (admin/kitchen)
router.get('/report/:year/:month', requireAuth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    // Lấy tất cả user
    const allUsers = await User.find({ role: 'user' }, 'username fullName email');
    // Lấy tất cả đăng ký hủy trong tháng
    const cancels = await MealRegistration.find({ date: { $gte: start, $lt: end }, isCancel: true });
    // Lấy tất cả đăng ký suất ăn ngoài hệ thống trong tháng
    const guestRegs = await MealRegistration.find({ date: { $gte: start, $lt: end }, isGuest: true });
    // Sinh ra tất cả các bữa ăn trong tháng
    const daysInMonth = new Date(year, month, 0).getDate();
    let allMeals = [];
    for (let d = 1; d <= daysInMonth; d++) {
      // Bữa trưa
      allMeals.push({ date: new Date(year, month - 1, d, 11, 30), type: 'lunch' });
      // Bữa tối
      allMeals.push({ date: new Date(year, month - 1, d, 18, 0), type: 'dinner' });
    }
    // Tính tổng công cho từng user
    const report = allUsers.map(u => {
      let count = 0;
      for (const meal of allMeals) {
        // Nếu user này KHÔNG đăng ký hủy cho bữa này thì được tính 1 công
        const hasCancel = cancels.some(c => c.user.toString() === u._id.toString() && c.type === meal.type && c.date.getTime() === meal.date.getTime());
        if (!hasCancel) count++;
      }
      // Tổng số suất khách user này đã đăng ký trong tháng
      const guestTotal = guestRegs.filter(g => g.user.toString() === u._id.toString()).reduce((sum, g) => sum + (g.guestCount || 0), 0);
      // Cộng số công khách vào tổng công
      return { user: u, count: count + guestTotal, guestTotal };
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Lấy danh sách bữa ăn ảo cho 7 ngày tới (2 bữa/ngày)
router.get('/list', requireAuth, async (req, res) => {
  try {
    const result = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      // Bữa trưa: 11h30 (giờ Việt Nam)
      const lunchMeal = {
        date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 11, 30),
        type: 'lunch',
        _id: `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}-lunch`,
      };
      // Bữa tối: 18h00 (giờ Việt Nam)
      const dinnerMeal = {
        date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0),
        type: 'dinner',
        _id: `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}-dinner`,
      };
      result.push(lunchMeal, dinnerMeal);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Lấy lịch sử đăng ký hủy suất ăn của user
router.get('/my-registrations', requireAuth, async (req, res) => {
  try {
    const regs = await MealRegistration.find({ user: req.user.userId });
    res.json(regs);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Đăng ký thêm suất ăn cho người ngoài hệ thống (user)
router.post('/register-guest', requireAuth, async (req, res) => {
  try {
    const { date, type, guestName, guestCount, guestReason } = req.body;
    if (!date || !type || !guestName || !guestCount) {
      return res.status(400).json({ message: 'Thiếu thông tin đăng ký suất ăn ngoài hệ thống' });
    }
    const mealTime = new Date(date);
    // Lưu bản ghi suất ăn ngoài hệ thống
    const reg = new MealRegistration({
      user: req.user.userId,
      date: mealTime,
      type,
      isCancel: false,
      guestName,
      guestCount,
      guestReason,
      guestBy: req.user.userId,
      isGuest: true
    });
    await reg.save();
    await ActivityLog.create({
      user: req.user.userId,
      action: 'register_guest_meal',
      detail: `Đăng ký thêm ${guestCount} suất ăn cho khách (${guestName}) vào bữa ${type} ngày ${mealTime.toISOString().slice(0,10)}${guestReason ? ' - Lý do: ' + guestReason : ''}`
    });
    res.status(201).json(reg);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Hủy đăng ký suất ăn trước giờ ăn (user) - không cần populate('meal')
router.delete('/registration/:registrationId', requireAuth, async (req, res) => {
  try {
    const reg = await MealRegistration.findById(req.params.registrationId);
    if (!reg) return res.status(404).json({ message: 'Không tìm thấy đăng ký' });
    if (reg.user.toString() !== req.user.userId) return res.status(403).json({ message: 'Không có quyền hủy đăng ký này' });
    // Kiểm tra thời gian: chỉ cho phép hủy trước giờ ăn 30 phút
    const now = new Date();
    const mealTime = new Date(reg.date);
    if (mealTime - now <= 30 * 60 * 1000) {
      return res.status(400).json({ message: 'Chỉ được hủy đăng ký trước giờ ăn 30 phút' });
    }
    await reg.deleteOne();
    // Log hoạt động
    await ActivityLog.create({ user: req.user.userId, action: 'cancel_registration', detail: `Hủy đăng ký suất ăn id=${req.params.registrationId}` });
    res.json({ message: 'Đã hủy đăng ký suất ăn' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Xóa bữa ăn (admin)
router.delete('/:mealId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    await Meal.findByIdAndDelete(req.params.mealId);
    res.json({ message: 'Đã xóa bữa ăn' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// Cập nhật bữa ăn (admin)
router.put('/:mealId', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { date, type } = req.body;
    const meal = await Meal.findByIdAndUpdate(req.params.mealId, { date, type }, { new: true });
    res.json(meal);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API kitchen: tổng hợp số người ăn, số người hủy, danh sách chi tiết cho từng bữa (dựa trên date, type)
router.get('/kitchen/summary', requireAuth, requireRole(['kitchen', 'admin']), async (req, res) => {
  try {
    const { date, type } = req.query;
    if (!date || !type) return res.status(400).json({ message: 'Thiếu thông tin ngày hoặc loại bữa' });
    const mealDate = new Date(date);
    const start = new Date(Date.UTC(mealDate.getUTCFullYear(), mealDate.getUTCMonth(), mealDate.getUTCDate(), 0, 0, 0, 0));
    const end = new Date(Date.UTC(mealDate.getUTCFullYear(), mealDate.getUTCMonth(), mealDate.getUTCDate(), 23, 59, 59, 999));
    console.log('[DEBUG] kitchen/summary', { type, start, end });
    const cancels = await MealRegistration.find({ date: { $gte: start, $lte: end }, type, isCancel: true }).populate('user', 'username fullName email');
    const guestRegs = await MealRegistration.find({ date: { $gte: start, $lte: end }, type, isGuest: true }).populate('user', 'username fullName email guestBy');
    console.log('[DEBUG] Cancels:', cancels);
    console.log('[DEBUG] GuestRegs:', guestRegs);
    const allUsers = await User.find({ role: 'user' }, 'username fullName email');
    const cancelUserIds = new Set(cancels.map(r => r.user._id.toString()));
    const eaters = allUsers.filter(u => !cancelUserIds.has(u._id.toString()));
    const totalGuest = guestRegs.reduce((sum, g) => sum + (g.guestCount || 0), 0);
    res.json({
      meal: { date: mealDate, type },
      totalEat: eaters.length + totalGuest,
      totalCancel: cancels.length,
      eaters,
      cancels: cancels.map(r => r.user),
      guestRegs: guestRegs.map(g => ({
        guestName: g.guestName,
        guestCount: g.guestCount,
        guestReason: g.guestReason,
        guestBy: g.user,
      })),
      totalGuest
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router; 