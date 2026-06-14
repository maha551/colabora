# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public GitHub issue.

Report it privately by emailing the maintainers (see the contact address configured for your deployment, or open a [GitHub private security advisory](https://github.com/maha551/colabora/security/advisories/new) if enabled).

Include:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)

We aim to acknowledge reports within 72 hours.

## Self-hosted deployments

Operators are responsible for:

- Strong `JWT_SECRET` (32+ random bytes)
- Database and Redis credentials
- TLS termination and firewall rules
- Keeping dependencies updated (`npm audit`)

Run the built-in check locally before deploying:

```bash
npm run test:security
```
