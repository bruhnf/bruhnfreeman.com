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

async function sendPasswordResetEmail(email, token) {
  const link = `${process.env.APP_BASE_URL}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
  try {
    await transporter.sendMail({
      to: email,
      subject: 'Reset Your Bruhn Freeman Password',
      html: `
        <p>You requested a password reset for your Bruhn Freeman account.</p>
        <p>Click <a href="${link}">here</a> to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      `
    });
    console.log(`Password reset email sent to: ${email}`);
  } catch (err) {
    console.error('Password reset email error:', err);
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
    // A2P 10DLC compliance: Append opt-out instructions to all SMS messages
    const messageWithOptOut = `${message}\n\nReply STOP to opt out. HELP for help. Msg&data rates may apply.`;
    await client.messages.create({
      body: messageWithOptOut,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log(`SMS sent to: ${phone}`);
  } catch (err) {
    console.error('SMS send error:', err);
    throw err;
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendCodeEmail, sendSMS };