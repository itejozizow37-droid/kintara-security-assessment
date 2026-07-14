# Security Advisory: @fastify/static Multiple Vulnerabilities

## Summary

| ID | Title | Severity | CWE |
|----|-------|----------|-----|
| FSV-001 | Extension filter bypass via URL encoding | Medium | CWE-22 |
| FSV-002 | Symlink traversal outside static root | Medium | CWE-61 |
| FSV-003 | Dotfile directory listing leak | Medium | CWE-548 |
| FSV-004 | Pre-compressed file ACL bypass | Low | CWE-552 |
| FSV-005 | File existence timing oracle | Low | CWE-208 |

## Affected Versions

`@fastify/static` >= 8.0.0, <= 9.1.0

## Discoverer

Security researcher — discovered during third-party security assessment of kintara.gg (July 2026)

## Contact

GitHub: [itejozizow37-droid](https://github.com/itejozizow37-droid)

## Disclosure Timeline

- 2026-07-09: Vulnerabilities discovered
- 2026-07-10: Lab reproduction completed
- 2026-07-11: Impact analysis against production deployment
- 2026-07-14: Public disclosure with full reproduction code

## References

- Full report: [fastify-static-zero-days.md](./fastify-static-zero-days.md)
- Reproduction lab: [/exploits/fastify-static-lab/](../exploits/fastify-static-lab/)
- Parent assessment: [kintara-security-assessment](https://github.com/itejozizow37-droid/kintara-security-assessment)
