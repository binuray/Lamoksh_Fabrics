import { createMailTransporter } from '../config/mail';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function sendAdminInvitationEmail(
  toEmail: string,
  adminName: string,
  tempPassword: string
): Promise<void> {
  try {
    const transporter = await createMailTransporter();
    const setupLink = `${env.CLIENT_URL}/set-password?email=${encodeURIComponent(toEmail)}`;

    const mailOptions = {
      from: env.SMTP_FROM,
      to: toEmail,
      subject: 'Welcome to Lamkosh - Admin Account Created',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${adminName},</h2>
          <p>An Admin account has been created for you on the Lamkosh platform.</p>
          <p>Your temporary password is: <strong>${tempPassword}</strong></p>
          <p>Please log in and change your password immediately before accessing admin operations:</p>
          <p><a href="${setupLink}" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Set Password</a></p>
          <p>If you did not request this account, please contact system administration immediately.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: toEmail }, 'Admin invitation email sent successfully');
  } catch (error) {
    logger.error({ error, toEmail }, 'Failed to send admin invitation email');
  }
}

export async function sendOtpResetEmail(
  toEmail: string,
  otp: string,
  expiresInMinutes: number
): Promise<void> {
  try {
    const transporter = await createMailTransporter();

    const mailOptions = {
      from: env.SMTP_FROM,
      to: toEmail,
      subject: 'Password Reset Verification Code - Lamkosh',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Password Reset Request</h2>
          <p>Your 6-digit verification OTP code is:</p>
          <h1 style="letter-spacing: 5px; color: #007bff;">${otp}</h1>
          <p>This OTP will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
          <p>If you did not request a password reset, please ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: toEmail }, 'OTP reset email sent successfully');
  } catch (error) {
    logger.error({ error, toEmail }, 'Failed to send OTP reset email');
  }
}

export async function sendPasswordChangedEmail(toEmail: string, userName: string): Promise<void> {
  try {
    const transporter = await createMailTransporter();

    const mailOptions = {
      from: env.SMTP_FROM,
      to: toEmail,
      subject: 'Security Alert: Password Changed - Lamkosh',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${userName},</h2>
          <p>Your password for your Lamkosh account was recently updated.</p>
          <p>If you made this change, no further action is required.</p>
          <p><strong>If you did not make this change, please contact security support immediately.</strong></p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: toEmail }, 'Password changed email sent successfully');
  } catch (error) {
    logger.error({ error, toEmail }, 'Failed to send password changed email');
  }
}

export async function sendOrderConfirmationEmail(orderData: any): Promise<void> {
  try {
    const transporter = await createMailTransporter();
    const toEmail = orderData.customerEmail;
    const itemsHtml = orderData.items
      .map(
        (item: any) => `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">
              <strong>${item.productName}</strong><br/>
              ${item.productDescription ? `<small>${item.productDescription}</small><br/>` : ''}
              ${item.variantSize ? `<small>Size: ${item.variantSize}</small> ` : ''}
              ${item.productColor ? `<small>Color: ${item.productColor}</small>` : ''}
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.unitSellPrice}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.lineTotal}</td>
          </tr>
        `
      )
      .join('');

    const addr = orderData.shippingAddress;
    const addressHtml = `
      ${addr.name}<br/>
      ${addr.address}<br/>
      ${addr.homeTown}, ${addr.city}, ${addr.state} - ${addr.pincode}<br/>
      Mobile: ${addr.mobileNumber}
    `;

    const mailOptions = {
      from: env.SMTP_FROM,
      to: toEmail,
      subject: `Order Confirmed - ${orderData.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #2c3e50; margin-bottom: 5px;">Order Confirmation</h2>
          <p style="color: #7f8c8d; font-size: 14px; margin-top: 0;">Thank you for your order, <strong>${orderData.customerName}</strong>!</p>
          <p>Order Number: <strong>${orderData.orderNumber}</strong><br/>
          Order Date: <strong>${new Date(orderData.createdAt).toLocaleDateString('en-IN', { dateStyle: 'full' })}</strong></p>
          
          <h3 style="border-bottom: 2px solid #2c3e50; padding-bottom: 5px;">Order Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f8f9fa;">
                <th style="padding: 8px; text-align: left;">Item</th>
                <th style="padding: 8px; text-align: center;">Qty</th>
                <th style="padding: 8px; text-align: right;">Price</th>
                <th style="padding: 8px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="margin-bottom: 20px; text-align: right;">
            <p style="margin: 3px 0;">Subtotal: <strong>₹${orderData.subtotal}</strong></p>
            <p style="margin: 3px 0;">Shipping Charge: <strong>₹${orderData.shippingCharge}</strong></p>
            <p style="margin: 5px 0; font-size: 18px; color: #27ae60;">Total Amount: <strong>₹${orderData.totalAmount}</strong></p>
          </div>

          <h3 style="border-bottom: 2px solid #2c3e50; padding-bottom: 5px;">Shipping Address</h3>
          <p style="background-color: #f8f9fa; padding: 12px; border-radius: 5px;">
            ${addressHtml}
          </p>

          <p style="font-size: 12px; color: #95a5a6; margin-top: 30px;">
            If you have any questions regarding your order, please contact support.
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: toEmail }, 'Order confirmation email sent successfully');
  } catch (error) {
    logger.error({ error, customerEmail: orderData.customerEmail }, 'Failed to send order confirmation email');
  }
}

export async function sendAdminOrderNotificationEmail(orderData: any, adminEmail: string): Promise<void> {
  try {
    const transporter = await createMailTransporter();
    const mailOptions = {
      from: env.SMTP_FROM,
      to: adminEmail,
      subject: `New Order Received - ${orderData.orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>New Order Received: ${orderData.orderNumber}</h2>
          <p><strong>Customer Name:</strong> ${orderData.customerName}</p>
          <p><strong>Mobile:</strong> ${orderData.customerMobile}</p>
          <p><strong>Email:</strong> ${orderData.customerEmail}</p>
          <p><strong>Total Amount:</strong> ₹${orderData.totalAmount}</p>
          <p><strong>Items Count:</strong> ${orderData.items.length}</p>
          <p>Log in to admin dashboard for full details.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: adminEmail }, 'Admin order notification email sent successfully');
  } catch (error) {
    logger.error({ error, adminEmail }, 'Failed to send admin order notification email');
  }
}

export async function sendGuestAccountCreatedEmail(
  toEmail: string,
  customerName: string
): Promise<void> {
  try {
    const transporter = await createMailTransporter();
    const setupLink = `${env.CLIENT_URL}/forgot-password?email=${encodeURIComponent(toEmail)}`;

    const mailOptions = {
      from: env.SMTP_FROM,
      to: toEmail,
      subject: 'Welcome to Lamkosh - Your Account Has Been Created',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello ${customerName},</h2>
          <p>Thank you for shopping at Lamkosh! An account has been created for you using <strong>${toEmail}</strong> so you can easily track your orders.</p>
          <p>To access your account and set up your password, please click below:</p>
          <p><a href="${setupLink}" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Set Your Password</a></p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to: toEmail }, 'Guest account creation email sent successfully');
  } catch (error) {
    logger.error({ error, toEmail }, 'Failed to send guest account creation email');
  }
}

