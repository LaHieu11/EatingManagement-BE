# Hướng dẫn cấu hình Twilio cho SMS OTP

## Bước 1: Đăng ký tài khoản Twilio
1. Truy cập https://www.twilio.com/
2. Đăng ký tài khoản miễn phí
3. Xác thực email và số điện thoại

9X1WNQVAWQ9UBGTK4F6S62LY

## Bước 2: Lấy thông tin cấu hình
1. Đăng nhập vào Twilio Console
2. Tìm Account SID và Auth Token trong Dashboard
3. Mua một số điện thoại Twilio (có thể dùng trial number)

## Bước 3: Cấu hình biến môi trường
Thêm các biến sau vào file `.env`:

```
# Twilio SMS
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
```

## Bước 4: Cấu hình Railway (nếu deploy)
Thêm các biến môi trường trong Railway dashboard:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

## Lưu ý:
- Trial account có giới hạn số lượng SMS
- Số điện thoại Twilio phải được verify trước khi gửi SMS
- Định dạng số điện thoại Việt Nam: +84xxxxxxxxx 