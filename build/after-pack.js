'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

/* electron-builder afterPack hook — runs right after the .app is assembled,
   before the DMG/ZIP are created, so both artifacts contain the fixed bundle.

   THE "APP IS DAMAGED" FIX:
   electron-builder with `mac.identity: null` skips code signing entirely. That
   leaves only Electron's per-binary linker-signed stub — the OUTER .app bundle
   has no coherent CodeResources seal. On Apple Silicon, once such a bundle is
   quarantined (any download from the internet), Gatekeeper can't validate it
   and macOS reports: "WiFi Billionaire is damaged and can't be opened." — a
   dead end with only a "Move to Trash" button.

   A proper *deep ad-hoc* signature (`codesign --sign -`) seals the whole
   bundle coherently. That converts the fatal "damaged" error into the normal,
   bypassable "unidentified developer" prompt (right-click → Open, once). It's
   the best you can do without a paid Apple Developer ID + notarization. */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return; // Windows/Linux: nothing to do

  const appName = context.packager.appInfo.productFilename; // "WiFi Billionaire"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

  console.log(`\n  ⚙️  after-pack: ad-hoc signing ${appName}.app`);
  try { run('xattr', ['-cr', appPath]); } catch (e) { /* no xattrs to clear — fine */ }

  // --force replaces the linker stub; --deep seals nested helpers & frameworks;
  // --sign - is an ad-hoc identity (no certificate needed).
  run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath]);
  // fail the build loudly if the seal isn't coherent
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=1', appPath]);

  console.log('  ✅ bundle ad-hoc signed & verified — no more "damaged" on Apple Silicon\n');
};
