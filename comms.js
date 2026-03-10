// comms.js (Most Recent Iteration)
const nodemailer = require('nodemailer');
const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendVerificationEmail(email, token) {
  const link = `${process.env.APP_BASE_URL}/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
  try {
    await transporter.sendMail({
      to: email,
      subject: 'Verify Your Account for Bruhn Freeman',
      html: `<p>Click <a href="${link}">here</a> to verify your account and access Phone Tester.</p>`
    });
    console.log(`Verification email sent to: ${email}`);
  } catch (err) {
    console.error('Email send error:', err);
    throw err;
  }
}

async function sendCodeEmail(email, codes) {
  try {
    await transporter.sendMail({
      to: email,
      subject: 'Your Phone Tester Code Words',
      text: `Your 5 code words: ${codes.join(', ')} Please call this number. ${process.env.TWILIO_PHONE_NUMBER}`
    });
    console.log(`Code email sent to: ${email}`);
  } catch (err) {
    console.error('Code email error:', err);
    throw err;
  }
}

async function sendSMS(phone, message) {
  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log(`SMS sent to: ${phone}`);
  } catch (err) {
    console.error('SMS send error:', err);
    throw err;
  }
}

module.exports = { sendVerificationEmail, sendCodeEmail, sendSMS };