const nodemailer = require('nodemailer');

const transport = (() => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
})();

const sendMail = async ({ to, subject, text }) => {
  if (!transport) {
    console.log('[email] SMTP not configured, skipping email:', { to, subject, text });
    return;
  }

  await transport.sendMail({ from: process.env.SMTP_USER || 'no-reply@example.com', to, subject, text });
};

module.exports = { sendMail };
