# Distribution

Divex uses electron-builder to create desktop artifacts. Packaging never
publishes automatically; generated files stay in the ignored `release/`
directory until a maintainer explicitly uploads them.

## Local package checks

Create an unpacked, unsigned application for the current platform:

```bash
npm run package
```

This command disables certificate auto-discovery intentionally. Use it to test
the packaged filesystem, application startup, native terminal binary, and icon.

## Installer commands

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

The configured targets are:

| Platform | Artifacts |
| --- | --- |
| macOS | DMG and ZIP |
| Windows | NSIS installer and ZIP |
| Linux | AppImage and DEB |

Build each operating system on that operating system. Native target builds are
the reliable path for `node-pty`, installer tooling, signing, and verification.
The bundled `node-pty` prebuilds are kept outside ASAR so the integrated
terminal works after installation.

For an unsigned macOS installer used only for local QA:

```bash
npm run dist:mac:unsigned
```

Unsigned artifacts are not suitable for public release. macOS and Windows
users otherwise receive operating-system security warnings.

## Signing and notarization

Public macOS builds require a unique Developer ID Application identity and
Apple notarization credentials. Configure signing with electron-builder's
standard `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables, and configure
Apple notarization before running `npm run dist:mac`. If a keychain contains
duplicate identities, remove the duplicate or select an unambiguous identity.

Public Windows builds require a trusted code-signing certificate. Provide it
through `CSC_LINK` and `CSC_KEY_PASSWORD` on the Windows release machine.

Do not commit certificates, passwords, Apple credentials, or signing profiles.

## Release checklist

1. Update the semantic version in `package.json`.
2. Run `npm ci` and `npm run check` from a clean checkout.
3. Build on each target operating system.
4. Install and launch every artifact on a clean machine or virtual machine.
5. Verify opening an untrusted folder starts in Restricted Mode.
6. Verify trust enables the terminal, Git, Flutter tools, and run commands.
7. Verify revoking trust closes terminals and disables execution again.
8. Verify the editor, both maps, Divex Mini, and database flow.
9. Verify signatures and macOS notarization before upload.
10. Publish checksums alongside the installers.

## Current limitation

Automatic updates and release publishing are intentionally not enabled yet.
They need a stable release channel, signed update metadata, rollback behavior,
and an explicit user-facing update policy.

