/**
 * Webpack Patch: bake the backend wiring into the bundle via DefinePlugin.
 *
 * Single source of truth: .deploy-output.json (written by the deployer at the
 * repo root). This patch reads the backendUrl + backendApiResource for this
 * solution's slug and replaces the static process.env.SPFX_IMAGEO_* references
 * in the code with string literals at build time — the Microsoft-supported
 * webpack-customization path for SPFx 1.22+ with Heft.
 *
 * Flow: deploy (writes .deploy-output.json) -> build (this injects it).
 *
 * Local backend loop: override without a deploy via env vars, e.g.
 *   IMAGEO_BACKEND_URL=http://localhost:7071/api IMAGEO_BACKEND_RESOURCE=api://… npm start
 */

const fs = require('fs');
const path = require('path');

// Resolve the same webpack the SPFx rig uses: nested under the rig (1.22) or
// hoisted to the top level (1.23, single copy/same version).
function loadWebpack() {
  try {
    return require('@microsoft/spfx-web-build-rig/node_modules/webpack');
  } catch {
    return require('webpack');
  }
}

module.exports = function (webpackConfig) {
  const repoRoot = path.resolve(__dirname, '../../..'); // spfx/config/webpack-patch -> repo root
  const deployOutputPath = path.resolve(repoRoot, '.deploy-output.json');
  const configPath = path.resolve(__dirname, '../..', 'deploy.config.json'); // spfx/deploy.config.json

  let backendUrl = process.env.IMAGEO_BACKEND_URL;
  let backendApiResource = process.env.IMAGEO_BACKEND_RESOURCE;

  if ((!backendUrl || !backendApiResource) && fs.existsSync(deployOutputPath)) {
    let slug = 'imageo';
    try { slug = JSON.parse(fs.readFileSync(configPath, 'utf8')).slug || slug; } catch { /* default */ }
    const data = (JSON.parse(fs.readFileSync(deployOutputPath, 'utf8'))[slug]) || {};
    backendUrl = backendUrl || data.backendUrl;
    backendApiResource = backendApiResource || data.backendApiResource;
  }

  if (!backendUrl || !backendApiResource) {
    console.warn('[webpack-patch] No backend wiring found — deploy first (writes .deploy-output.json) or set IMAGEO_BACKEND_URL / IMAGEO_BACKEND_RESOURCE. Bundle backend config will be empty.');
  }

  // Always define both (even empty) so the bundle never carries a dangling
  // process.env reference that would throw at runtime.
  const definitions = {
    'process.env.SPFX_IMAGEO_BACKEND_URL': JSON.stringify(backendUrl || ''),
    'process.env.SPFX_IMAGEO_BACKEND_RESOURCE': JSON.stringify(backendApiResource || ''),
  };

  const webpack = loadWebpack();
  webpackConfig.plugins = webpackConfig.plugins || [];
  webpackConfig.plugins.push(new webpack.DefinePlugin(definitions));

  console.log(`[webpack-patch] Injected backend wiring: ${backendUrl || '(empty)'}`);
  return webpackConfig;
};
