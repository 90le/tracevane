# Chat Official Parity

> Status: active reference
> Updated: 2026-06-12

This note records the split between host install metadata and Tracevane runtime metadata for the official Chat integration.

## Host Compatibility

`package.json` is the authoritative source for host compatibility and install entrypoints. It owns:

- `openclaw.install.minHostVersion`
- source extension entrypoint
- runtime extension entrypoint

Keeping `minHostVersion` in `package.json` avoids duplicating host install policy in the plugin manifest.

## Runtime Manifest

`openclaw.plugin.json` describes Tracevane plugin identity and runtime contracts after the host has accepted the package. It keeps startup activation explicit with `activation.onStartup` and declares runtime contracts such as `tracevane_delivery`.

The manifest intentionally does not carry host install semantics such as package requirements, provided package kinds, or dist entrypoints. Those remain in `package.json`.
