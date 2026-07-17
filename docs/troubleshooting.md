# Troubleshooting

- **Checksum mismatch:** stop, redownload metadata and verify SHA-256; never bypass it.
- **Unsupported Bash/platform:** use Linux or macOS Bash; WSL requires Linux-side Node and filesystem.
- **OpenClaw version:** upgrade to >= 2026.5.28 and run `openclaw config validate`.
- **node-pty degraded:** install build tooling and run `npm rebuild`; `degradedFeatures` records the limitation.
- **Service manager fallback:** inspect `gateway run` logs when user services are unavailable.
- **Health URLs:** standalone `http://127.0.0.1:3760/api/system/health`; gateway `/tracevane/api/system/health` plus 3760 fallback.
- **Offline/uninstall:** use explicit version/package URL/checksum; `--uninstall` keeps backups for rollback.
- **GitHub Issue:** include platform, versions, changed paths, and redacted JSON/logs; remove tokens and credentials.
