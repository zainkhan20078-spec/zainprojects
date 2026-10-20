import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const manifestPath = path.join(projectRoot, "manifest.json");
const publicManifestPath = path.join(projectRoot, "public", "manifest.json");
const privacyPath = path.join(projectRoot, "PRIVACY.md");
const packagePath = path.join(projectRoot, "package.json");
const lockPath = path.join(projectRoot, "package-lock.json");
const distManifestPath = path.join(projectRoot, "dist", "manifest.json");

const manifest = readJson(manifestPath);
const publicManifest = readJson(publicManifestPath);
const privacyText = fs.readFileSync(privacyPath, "utf8");
const packageJson = readJson(packagePath);
const lock = readJson(lockPath);
const contactLine = privacyText.match(/Publisher privacy contact:\s*\*\*(.+)\*\*/);
const policyLine = privacyText.match(/Public privacy policy URL:\s*\*\*(.+)\*\*/);
const privacyContact = contactLine?.[1]?.trim() ?? "";
const privacyPolicyUrl = policyLine?.[1]?.trim() ?? "";
const pdfjsVersion = lock.packages?.["node_modules/pdfjs-dist"]?.version;
const pdfjsParts = typeof pdfjsVersion === "string" ? pdfjsVersion.split(".").map(Number) : [];

assert(manifest.manifest_version === 3, "Manifest must use MV3 for Chrome extension release.");
assert(publicManifest.manifest_version === 3, "Public manifest must use MV3 for Chrome extension release.");
assert(JSON.stringify(manifest) === JSON.stringify(publicManifest), "Source and public manifests must match.");
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "Manifest version must be semver-like.");
assert(/^\d+\.\d+\.\d+$/.test(publicManifest.version), "Public manifest version must be semver-like.");
assert(manifest.name && manifest.name.trim().length > 0, "Manifest name is required.");
for (const iconPath of Object.values(manifest.icons ?? {})) {
  assert(fs.existsSync(path.join(projectRoot, "public", iconPath)), `Missing extension icon: ${iconPath}`);
}
for (const iconPath of Object.values(manifest.action?.default_icon ?? {})) {
  assert(fs.existsSync(path.join(projectRoot, "public", iconPath)), `Missing action icon: ${iconPath}`);
}
assert(manifest.permissions?.includes("storage"), "Manifest must include storage permission.");
assert(!manifest.permissions?.includes("scripting"), "Manifest must not request unused scripting permission.");
assert(
  !publicManifest.permissions?.includes("scripting"),
  "Public manifest must not request unused scripting permission.",
);
assert(manifest.oauth2?.client_id, "Manifest must include a Google OAuth client ID for Drive sync.");
assert(manifest.side_panel?.default_path === "index.html", "Extension side panel must point to the built UI.");
assert(manifest.minimum_chrome_version, "Release manifest should declare a minimum Chrome version.");
assert(publicManifest.minimum_chrome_version, "Public manifest should declare a minimum Chrome version.");
assert(packageJson.engines?.node === ">=22.13.0", "Node.js release requirement must match the pinned PDF.js runtime.");
assert(
  pdfjsParts.length === 3 &&
    (pdfjsParts[0] > 6 ||
      (pdfjsParts[0] === 6 && pdfjsParts[1] > 2) ||
      (pdfjsParts[0] === 6 && pdfjsParts[1] === 2 && pdfjsParts[2] >= 108)),
  "Locked PDF.js version must include the malicious-PDF scripting fix (6.2.108 or newer).",
);
const isPublicHttpsUrl = (value) => {
  try {
    const parsedUrl = new URL(value);
    return (
      parsedUrl.protocol === "https:" &&
      !parsedUrl.username &&
      !parsedUrl.password &&
      parsedUrl.hostname !== "localhost" &&
      !/(^|\.)example\.(com|net|org)$/i.test(parsedUrl.hostname) &&
      !/\.(example|invalid|test)$/i.test(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
};
const emailMatch = privacyContact.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
const emailDomain = emailMatch?.[1] ?? "";
const validEmail =
  emailMatch !== null &&
  !/(^|\.)example\.(com|net|org)$/i.test(emailDomain) &&
  !/\.(example|invalid|test)$/i.test(emailDomain);
const validContact = !privacyContact.includes("RELEASE BLOCKER") && (validEmail || isPublicHttpsUrl(privacyContact));
const validPrivacyPolicyUrl = !privacyPolicyUrl.includes("RELEASE BLOCKER") && isPublicHttpsUrl(privacyPolicyUrl);
const releaseBlockers = [];
if (!validContact) {
  releaseBlockers.push("Add a monitored publisher email address or public HTTPS support URL to PRIVACY.md.");
}
if (!validPrivacyPolicyUrl) {
  releaseBlockers.push("Publish PRIVACY.md at a stable public HTTPS URL and set it in PRIVACY.md.");
}
if (releaseBlockers.length > 0) {
  throw new Error(`Production release blocked:\n- ${releaseBlockers.join("\n- ")}`);
}

if (!fs.existsSync(distManifestPath)) {
  throw new Error("Build the extension before running production validation (dist/manifest.json is missing).");
}
const distManifest = readJson(distManifestPath);
assert(JSON.stringify(manifest) === JSON.stringify(distManifest), "Built and source manifests must match.");
for (const iconPath of Object.values(manifest.icons ?? {})) {
  assert(fs.existsSync(path.join(projectRoot, "dist", iconPath)), `Built extension is missing icon: ${iconPath}`);
}

console.log("Production validation passed: manifests, PDF.js, publisher contact, and hosted privacy policy.");
