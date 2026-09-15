// Run in CI on every push to main (see .github/workflows/bump-version.yml).
// Bumps data/version.json's build/version, keeps the styles.css/app.js
// cache-busting query string in index.html in sync with the new build
// number, and regenerates preview.html — so a push never needs a human
// to remember any of this by hand.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const versionPath = path.join(root, "data/version.json");
const indexPath = path.join(root, "index.html");

const data = JSON.parse(fs.readFileSync(versionPath, "utf8"));

const parts = data.version.split(".").map(Number);
const major = parts[0] || 0;
const minor = parts[1] || 0;
const patch = parts[2] || 0;

const newBuild = data.build + 1;
const newVersion = `${major}.${minor}.${patch + 1}`;

data.build = newBuild;
data.version = newVersion;
data.releasedAt = new Date().toISOString().slice(0, 10);

const commitMessage = process.env.BUMP_NOTES;
if (commitMessage && commitMessage.trim()) {
  data.notes = commitMessage.trim().split("\n")[0].trim();
}

fs.writeFileSync(versionPath, JSON.stringify(data, null, 2) + "\n");

let html = fs.readFileSync(indexPath, "utf8");
html = html.replace(/href="styles\.css\?v=\d+"/, `href="styles.css?v=${newBuild}"`);
html = html.replace(/src="app\.js\?v=\d+"/, `src="app.js?v=${newBuild}"`);
fs.writeFileSync(indexPath, html);

execSync("node build-preview.js", { cwd: root, stdio: "inherit" });

console.log(`Bumped to version ${newVersion} (build ${newBuild})`);
