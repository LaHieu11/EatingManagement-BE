const twilio = require('twilio');

// Khởi tạo Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Hàm gửi SMS OTP
async function sendSMS(phoneNumber, message) {
  try {
    // Đảm bảo số điện thoại có định dạng quốc tế cho Việt Nam
    let formattedPhone = phoneNumber;
    if (phoneNumber.startsWith('0')) {
      formattedPhone = '+84' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+84')) {
      formattedPhone = '+84' + phoneNumber;
    }

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhone
    });

    console.log('SMS sent successfully:', result.sid);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return { success: false, error: error.message };
  }
}

// Hàm gửi OTP
async function sendOTP(phoneNumber, otp) {
  const message = `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này với ai.`;
  return await sendSMS(phoneNumber, message);
}

module.exports = {
  sendSMS,
  sendOTP
}; 