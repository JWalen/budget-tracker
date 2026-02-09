import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { query } from '../config/database';

// Email provider configuration
export type EmailProvider = 'sendgrid' | 'gmail' | 'smtp' | 'resend' | 'none';

// Load configuration from database on startup
const loadConfigFromDatabase = async () => {
  try {
    const result = await query('SELECT * FROM email_config WHERE id = 1');
    if (result.rows.length > 0) {
      const dbConfig = result.rows[0];

      // Update environment variables from database
      if (dbConfig.provider) process.env.EMAIL_PROVIDER = dbConfig.provider;
      if (dbConfig.from_email) process.env.EMAIL_FROM = dbConfig.from_email;
      if (dbConfig.from_name) process.env.EMAIL_FROM_NAME = dbConfig.from_name;
      if (dbConfig.sendgrid_api_key) process.env.SENDGRID_API_KEY = dbConfig.sendgrid_api_key;
      if (dbConfig.smtp_host) process.env.SMTP_HOST = dbConfig.smtp_host;
      if (dbConfig.smtp_port) process.env.SMTP_PORT = dbConfig.smtp_port.toString();
      if (dbConfig.smtp_user) process.env.SMTP_USER = dbConfig.smtp_user;
      if (dbConfig.smtp_pass) process.env.SMTP_PASS = dbConfig.smtp_pass;
      if (dbConfig.resend_api_key) process.env.RESEND_API_KEY = dbConfig.resend_api_key;

      console.log(`Email configuration loaded from database: ${dbConfig.provider} provider`);
    }
  } catch (error) {
    console.log('Email config table not found, using environment variables');
  }
};

// Load config on module initialization
loadConfigFromDatabase();

interface EmailConfig {
  provider: EmailProvider;
  from: string;
  fromName?: string;
  // SendGrid config
  sendgridApiKey?: string;
  // Gmail/SMTP config
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  // Resend config
  resendApiKey?: string;
}

// Get config from environment variables
const getEmailConfig = (): EmailConfig => {
  const provider = (process.env.EMAIL_PROVIDER || 'none').toLowerCase() as EmailProvider;

  return {
    provider,
    from: process.env.EMAIL_FROM || 'noreply@budgetapp.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Budget Tracker',
    // SendGrid
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    // SMTP/Gmail
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    // Resend
    resendApiKey: process.env.RESEND_API_KEY,
  };
};

const config = getEmailConfig();

// Initialize SendGrid if configured
if (config.provider === 'sendgrid' && config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

// Create Nodemailer transporter for SMTP/Gmail
const createTransporter = () => {
  if (config.provider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass, // Use app-specific password
      },
    });
  } else if (config.provider === 'smtp') {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });
  }
  return null;
};

const transporter = createTransporter();

// Email sending interface
export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Main email sending function
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const { to, subject, html, text } = options;
  const from = config.fromName ? `${config.fromName} <${config.from}>` : config.from;

  console.log(`Attempting to send email via ${config.provider} to ${to}`);

  try {
    switch (config.provider) {
      case 'sendgrid':
        if (!config.sendgridApiKey) {
          console.error('SendGrid API key not configured');
          return false;
        }

        const msg = {
          to,
          from,
          subject,
          text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
          html,
        };

        await sgMail.send(msg);
        console.log('Email sent successfully via SendGrid');
        return true;

      case 'gmail':
      case 'smtp':
        if (!transporter) {
          console.error('SMTP transporter not configured');
          return false;
        }

        await transporter.sendMail({
          from,
          to,
          subject,
          text: text || html.replace(/<[^>]*>/g, ''),
          html,
        });
        console.log(`Email sent successfully via ${config.provider}`);
        return true;

      case 'resend':
        if (!config.resendApiKey) {
          console.error('Resend API key not configured');
          return false;
        }

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, ''),
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Resend API error:', error);
          return false;
        }

        console.log('Email sent successfully via Resend');
        return true;

      case 'none':
        console.log('Email provider not configured - skipping email send');
        console.log('Would have sent email to:', to);
        console.log('Subject:', subject);
        return false;

      default:
        console.error(`Unknown email provider: ${config.provider}`);
        return false;
    }
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
};

// Email templates
export const emailTemplates = {
  budgetShareInvite: (data: {
    inviterName: string;
    inviteeName: string;
    role: 'view' | 'edit';
    inviteUrl: string;
  }) => {
    const { inviterName, inviteeName, role, inviteUrl } = data;
    const action = role === 'edit' ? 'collaborate on' : 'view';

    return {
      subject: `${inviterName} invited you to ${action} their budget`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Budget Share Invitation</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #0ea5e9; margin-top: 0; font-size: 28px;">Budget Tracker</h1>
            <h2 style="color: #1f2937; font-size: 20px;">You're invited to ${action} a budget!</h2>

            <p style="font-size: 16px; color: #4b5563;">
              Hi ${inviteeName || 'there'},
            </p>

            <p style="font-size: 16px; color: #4b5563;">
              <strong>${inviterName}</strong> has invited you to ${action} their budget in Budget Tracker.
              ${role === 'edit' ? 'You\'ll be able to add, edit, and manage transactions together.' : 'You\'ll have read-only access to view their financial data.'}
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 12px 30px; background-color: #0ea5e9; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                Accept Invitation
              </a>
            </div>

            <p style="font-size: 14px; color: #6b7280;">
              Or copy and paste this link into your browser:
            </p>
            <p style="font-size: 14px; color: #0ea5e9; word-break: break-all;">
              ${inviteUrl}
            </p>

            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

            <p style="font-size: 14px; color: #6b7280;">
              <strong>What happens next?</strong><br>
              ${role === 'edit'
                ? '• You\'ll be able to add and edit transactions<br>• Create and manage budgets<br>• View all financial reports'
                : '• You\'ll be able to view all transactions<br>• See budget progress<br>• Access financial reports (read-only)'}
            </p>

            <p style="font-size: 12px; color: #9ca3af; margin-top: 30px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>

          <div style="text-align: center; font-size: 12px; color: #9ca3af;">
            <p>
              Budget Tracker - Simple, Secure, Shared Budgeting<br>
              This is an automated message, please do not reply.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
        Budget Share Invitation

        Hi ${inviteeName || 'there'},

        ${inviterName} has invited you to ${action} their budget in Budget Tracker.
        ${role === 'edit' ? 'You\'ll be able to add, edit, and manage transactions together.' : 'You\'ll have read-only access to view their financial data.'}

        Accept the invitation by clicking this link:
        ${inviteUrl}

        What happens next?
        ${role === 'edit'
          ? '• You\'ll be able to add and edit transactions\n• Create and manage budgets\n• View all financial reports'
          : '• You\'ll be able to view all transactions\n• See budget progress\n• Access financial reports (read-only)'}

        If you didn't expect this invitation, you can safely ignore this email.
      `,
    };
  },

  budgetShareAccepted: (data: {
    ownerName: string;
    accepterName: string;
    accepterEmail: string;
  }) => {
    const { ownerName, accepterName, accepterEmail } = data;

    return {
      subject: `${accepterName} accepted your budget share invitation`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f0fdf4; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #16a34a; margin-top: 0; font-size: 24px;">✓ Invitation Accepted</h1>

            <p style="font-size: 16px; color: #4b5563;">
              Hi ${ownerName},
            </p>

            <p style="font-size: 16px; color: #4b5563;">
              Good news! <strong>${accepterName}</strong> (${accepterEmail}) has accepted your invitation to share your budget.
            </p>

            <p style="font-size: 16px; color: #4b5563;">
              They now have access to your budget and can start collaborating with you.
            </p>

            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              You can manage sharing permissions at any time from the Sharing page in your Budget Tracker.
            </p>
          </div>
        </body>
        </html>
      `,
    };
  },
};

// Test email configuration
export const testEmailConfig = async (): Promise<boolean> => {
  if (config.provider === 'none') {
    console.log('Email provider not configured');
    return false;
  }

  console.log(`Testing email configuration for provider: ${config.provider}`);
  console.log(`From address: ${config.from}`);

  // Try to send a test email to the from address
  return sendEmail({
    to: config.from,
    subject: 'Budget Tracker - Email Configuration Test',
    html: '<p>If you receive this email, your email configuration is working correctly!</p>',
  });
};