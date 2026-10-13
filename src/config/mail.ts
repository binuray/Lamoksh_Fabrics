import nodemailer from 'nodemailer';
import { env } from './env';

export async function createMailTransporter() {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
  }

  // Fallback to test ethereal account for dev/testing if credentials missing
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}
