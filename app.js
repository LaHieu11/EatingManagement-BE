require('dotenv').config();
const mongoose = require('mongoose');
const cors = require('cors');
const nodeCron = require('node-cron');
const nodemailer = require('nodemailer');
const Meal = require('./models/Meal');
const MealRegistration = require('./models/MealRegistration');
const User = require('./models/User');

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI);

var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const mealsRouter = require('./routes/meals');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors({
  origin: [
    'http://localhost:3001',
    'http://localhost:3000',
    'https://eating-management-fe.vercel.app',
    'https://eating-management.vercel.app',
    'https://eating-management-git-main.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.options('*', cors());

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/meals', mealsRouter);

// Cấu hình transporter cho nodemailer (ví dụ dùng Gmail, cần cấu hình biến môi trường)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Hàm gửi email thông báo
async function sendMealNotification(user, meal) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Thông báo suất ăn',
    text: `Bạn đã đăng ký suất ăn cho bữa ${meal.type === 'lunch' ? 'trưa' : 'tối'} vào lúc ${meal.date.toLocaleString('vi-VN')}. Vui lòng đến đúng giờ!`,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Lỗi gửi email:', err);
  }
}

// Cron job: mỗi 5 phút kiểm tra các bữa ăn sắp diễn ra sau 30 phút
nodeCron.schedule('*/5 * * * *', async () => {
  try {
    // Kiểm tra kết nối MongoDB trước khi thực hiện
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB chưa sẵn sàng, bỏ qua cron job');
      return;
    }

    const now = new Date();
    const thirtyMinLater = new Date(now.getTime() + 30 * 60 * 1000);
    
    // Tìm các bữa ăn diễn ra sau 30 phút (chỉ gửi thông báo 1 lần)
    const meals = await Meal.find({
      date: { $gte: thirtyMinLater, $lt: new Date(thirtyMinLater.getTime() + 60 * 1000) },
    }).maxTimeMS(5000); // Timeout 5 giây

    if (meals.length > 0) {
      console.log(`Tìm thấy ${meals.length} bữa ăn cần gửi thông báo`);
    }

    for (const meal of meals) {
      try {
        const regs = await MealRegistration.find({ meal: meal._id }).populate('user').maxTimeMS(5000);
        for (const reg of regs) {
          // Có thể thêm trường đã gửi thông báo để tránh gửi lặp lại
          await sendMealNotification(reg.user, meal);
        }
      } catch (mealErr) {
        console.error('Lỗi xử lý bữa ăn:', mealErr);
      }
    }
  } catch (err) {
    console.error('Lỗi cron job:', err);
  }
});

module.exports = app;
