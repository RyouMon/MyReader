<div align="right"><a href="./SECURITY.md">简体中文</a></div>

# Security Policy

## Supported Versions

MyReader has not yet reached 1.0. Security fixes are prioritized for the latest release; older versions are not guaranteed to receive backports.

## Reporting a Vulnerability

Do not open a public issue for a security vulnerability, and do not attach real books, cloud-storage credentials, or other private data to a report.

Prefer the repository's [private vulnerability reporting form](https://github.com/RyouMon/MyReader/security/advisories/new). If it is not available, email [wenslife@outlook.com](mailto:wenslife@outlook.com) with a subject beginning with `[MyReader Security]`.

Please provide, where possible:

- the affected version, platform, and architecture;
- reproduction steps and actual impact;
- minimal, redacted logs or examples;
- any known mitigation.

After receiving a report, the maintainer will confirm the affected scope and coordinate remediation and disclosure timing. Do not publish details or use the vulnerability to access data that does not belong to you before a fix is public.

## Data and Credential Boundaries

MyReader can connect to local directories, WebDAV, and OneDrive. Use test accounts and test libraries when reproducing an issue. Remove access tokens, passwords, server addresses, personal paths, and book content before sharing configuration, databases, crash reports, or screen recordings.
