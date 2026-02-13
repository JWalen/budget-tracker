# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take the security of our software seriously. If you believe you have found a security vulnerability in the Budget Tracker, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to `security@example.com` (replace with actual email).

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

## Security Best Practices

This application is designed to be self-hosted. To ensure the security of your instance:

1.  **Always use HTTPS** in production.
2.  **Change default secrets** in your `.env` file immediately after deployment.
3.  **Keep Docker images updated** to the latest stable versions.
4.  **Put the database behind a firewall** (do not expose port 5432 to the public internet).
5.  **Enable MFA** for all administrative accounts.

## Encryption

Sensitive data (MFA secrets, backup configurations) is encrypted at rest using AES-256-GCM. 
Ensure your `ENCRYPTION_KEY` environment variable is kept secure and backed up. Losing this key will render encrypted data unreadable.
