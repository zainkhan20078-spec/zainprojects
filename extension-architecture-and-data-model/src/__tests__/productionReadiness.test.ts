import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Production readiness", () => {
  it("declares a release-ready manifest profile", () => {
    const manifest = JSON.parse(readProjectFile("manifest.json"));
    const publicManifest = JSON.parse(readProjectFile("public/manifest.json"));
    const packageJson = JSON.parse(readProjectFile("package.json"));
    const packageLock = JSON.parse(readProjectFile("package-lock.json"));

    expect(manifest.manifest_version).toBe(3);
    expect(publicManifest.manifest_version).toBe(3);
    expect(publicManifest).toEqual(manifest);
    expect(manifest.minimum_chrome_version).toBeTruthy();
    expect(publicManifest.minimum_chrome_version).toBeTruthy();
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).not.toContain("scripting");
    expect(publicManifest.permissions).not.toContain("scripting");
    expect(manifest.oauth2?.client_id).toBeTruthy();
    expect(manifest.side_panel?.default_path).toBe("index.html");
    expect(manifest.icons).toHaveProperty("128", "icon-128.png");
    expect(manifest.action?.default_icon).toHaveProperty("32", "icon-32.png");
    expect(packageJson.engines.node).toBe(">=22.13.0");
    expect(packageLock.packages["node_modules/pdfjs-dist"].version).toMatch(/^6\./);
    expect(packageJson.dependencies).not.toHaveProperty("mammoth");
  });

  it("blocks release until the publisher contact and public policy URL are configured", () => {
    const privacyText = readProjectFile("PRIVACY.md");

    expect(privacyText).toContain("[RELEASE BLOCKER: add a monitored contact email or support URL]");
    expect(privacyText).toContain("[RELEASE BLOCKER: publish this notice at a stable HTTPS URL]");
  });
});
