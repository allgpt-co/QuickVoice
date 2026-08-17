# QuickVoice Support

QuickVoice is community-supported open-source software. Public help is best effort and has no guaranteed response or resolution time.

## Choose The Right Channel

| Need                                                                       | Channel                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Reproducible bug                                                           | Use the GitHub bug issue form.                                                    |
| `task up:dev` or local prerequisite failure                                | Use the setup issue form.                                                         |
| Documentation gap                                                          | Use the documentation issue form.                                                 |
| Feature or integration proposal                                            | Use the feature issue form before opening a broad pull request.                   |
| How-to or architecture discussion                                          | Start a [GitHub Discussion](https://github.com/allgpt-co/QuickVoice/discussions). |
| Security vulnerability                                                     | Follow [SECURITY.md](./SECURITY.md); never post vulnerability details publicly.   |
| Commercial licensing, managed hosting, implementation, or enterprise terms | Use the contact path on [quickvoice.co](https://quickvoice.co).                   |

Do not use a public issue as an emergency operations channel.

## Information That Helps

For a local setup report, include:

- Operating system and whether you are using Linux, macOS, WSL2, a Dev Container, or Codespaces.
- Output of `node --version`, `pnpm --version`, `bash --version`, `task --version`, `python3 --version`, `docker --version`, and `docker compose version`.
- The exact command that failed.
- The first relevant error and the smallest reproduction.
- Whether the failure occurs before or after external provider configuration is needed.

Redact secrets and personal data. Replace tokens, keys, account identifiers, real phone numbers, email addresses, recordings, transcripts, and customer content with obvious placeholders. If an error message contains a signed URL or authorization header, remove it before posting.

## Support Boundaries

The project can help diagnose code and documentation in this repository. Community support does not include:

- Operating a production deployment on a contributor's behalf.
- Supplying or debugging access to paid provider accounts.
- Reviewing private customer calls or data in a public channel.
- Certifying a deployment for HIPAA, SOC 2, ISO 27001, PCI, GDPR, CCPA, or another framework.
- Guaranteeing carrier delivery, model quality, latency, uptime, cost, or third-party availability.
- Supporting a modified fork without a minimal reproduction against the upstream repository.

Provider-specific failures may require the provider's own support channel once QuickVoice has sent a valid request and the remaining problem is account, quota, carrier, billing, regional, or service-side behavior.

## Security And Safety

Vulnerability details belong in private reporting. Suspected credential exposure should be treated as an incident: revoke or rotate the credential first, preserve appropriate evidence privately, and follow [SECURITY.md](./SECURITY.md).

For telephony testing, use numbers and recordings you are authorized to use. Consent, calling-hour, recording, disclosure, opt-out, and other legal requirements vary by jurisdiction and deployment; QuickVoice does not make those decisions for an operator.
