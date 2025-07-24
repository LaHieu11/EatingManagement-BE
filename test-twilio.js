require('dotenv').config();
const { sendOTP } = require('./config/twilio');

async function testTwilio() {
  console.log('Testing Twilio configuration...');
  console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set');
  console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set');
  console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER ? 'Set' : 'Not set');
  
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.log('❌ Twilio configuration incomplete. Please check your .env file.');
    return;
  }
  
  try {
    const testPhone = '0123456789'; // Thay bằng số điện thoại thật để test
    const testOTP = '123456';
    
    console.log(`Sending test OTP to ${testPhone}...`);
    const result = await sendOTP(testPhone, testOTP);
    
    if (result.success) {
      console.log('✅ SMS sent successfully!');
      console.log('SID:', result.sid);
    } else {
      console.log('❌ SMS failed to send');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testTwilio(); 