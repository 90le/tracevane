# Tracevane installation

Download, inspect, verify, then execute the release installer. Never use `curl | bash`.

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
/tmp/install-tracevane.sh --mode standalone
/tmp/install-tracevane.sh --json
```

Gateway mode uses the same safe steps and changes only the final command:

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
/tmp/install-tracevane.sh --mode gateway
/tmp/install-tracevane.sh --json
```

Use `--uninstall` to remove Tracevane while retaining a configuration backup. For offline installs provide `--version`, `--package-url`, and `--package-sha256`; verify with `sha256sum`. `--dry-run` previews changes. WSL users should run from a Linux filesystem with Bash, Node.js, and network access; Windows paths are not supported. User data and OpenClaw configuration are retained unless explicitly removed.

JSON output includes `version`, `installDir`, `configPath`, `accessUrls`, `healthChecks`, `warnings`, and `degradedFeatures`.
