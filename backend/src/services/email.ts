import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { query } from '../config/database';
import EncryptionService from './encryption';

// Provider secrets are stored encrypted at rest. Decrypt for runtime use;
// tolerate legacy plaintext values by falling back to the raw value.
const decryptSecret = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  try {
    return EncryptionService.decryptAPIKey(value);
  } catch {
    return value; // legacy plaintext
  }
};

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
      const sendgrid = decryptSecret(dbConfig.sendgrid_api_key);
      const smtpPass = decryptSecret(dbConfig.smtp_pass);
      const resend = decryptSecret(dbConfig.resend_api_key);
      if (sendgrid) process.env.SENDGRID_API_KEY = sendgrid;
      if (dbConfig.smtp_host) process.env.SMTP_HOST = dbConfig.smtp_host;
      if (dbConfig.smtp_port) process.env.SMTP_PORT = dbConfig.smtp_port.toString();
      if (dbConfig.smtp_user) process.env.SMTP_USER = dbConfig.smtp_user;
      if (smtpPass) process.env.SMTP_PASS = smtpPass;
      if (resend) process.env.RESEND_API_KEY = resend;

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

// Email templates (legacy sharing templates removed)
export const emailTemplates = {
  // Templates removed: budgetShareInvite, budgetShareAccepted
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