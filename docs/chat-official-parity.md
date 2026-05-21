# Chat Official Parity

This note records the split between host install metadata and Studio runtime
metadata for the official Chat integration.

## Host Compatibility

`package.json` is the authoritative source for host compatibility and install
entrypoints. It owns the `openclaw.install.minHostVersion` requirement, the
source extension entrypoint, and the runtime extension entrypoint. Keeping
`minHostVersion` in `package.json` avoids duplicating host install policy in the
plugin manifest.

## Runtime Manifest

`openclaw.plugin.json` describes the Studio plugin identity and runtime
contracts after the host has accepted the package. It keeps startup activation
explicit with `activation.onStartup` and declares the runtime `contracts` that
the host can expect, including the `studio_delivery` tool contract.

The manifest intentionally does not carry host install semantics such as package
requirements, provided package kinds, or dist entrypoints. Those remain in
`package.json` so the official package metadata and the runtime manifest do not
drift.
