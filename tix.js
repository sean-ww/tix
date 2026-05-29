#!/usr/bin/env node

/**
 * tix — Create a git branch from a Jira ticket
 *
 * Usage:
 *   tix CL-5267             → feature/CL-5267-ticket-title  (branched from dev)
 *   tix CL-5267 --hotfix    → hotfix/CL-5267-ticket-title
 *   tix CL-5267 --base main → branch from main instead of dev
 *
 * Config: ~/.tix.json  (see README / setup instructions)
 */

const https = require("https");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(path.dirname(fs.realpathSync(process.argv[1])), ".tix.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌  Config file not found: ${CONFIG_PATH}`);
    console.error(`    Create it with your Jira credentials. Example:`);
    console.error(
      `    ${JSON.stringify({ jiraHost: "yourcompany.atlassian.net", jiraEmail: "you@example.com", jiraToken: "your-api-token", defaultBase: "dev" }, null, 2)}`
    );
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    console.error(`❌  Could not parse ${CONFIG_PATH} — check it's valid JSON`);
    process.exit(1);
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (!args.length || args[0] === "--help" || args[0] === "-h") {
  console.log(`
Usage: tix <TICKET-ID> [options]

Options:
  --hotfix        Use hotfix/ prefix instead of feature/ or bugfix/
  --base <branch> Branch from <branch> instead of the configured defaultBase
  -h, --help      Show this help
`);
  process.exit(0);
}

const ticketId = args[0].toUpperCase();
const isHotfix = args.includes("--hotfix");
const baseIdx = args.indexOf("--base");
const baseBranchOverride = baseIdx !== -1 ? args[baseIdx + 1] : null;

// ─── Jira fetch ───────────────────────────────────────────────────────────────

function fetchTicket(config, ticketId) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${config.jiraEmail}:${config.jiraToken}`).toString("base64");
    const options = {
      hostname: config.jiraHost,
      path: `/rest/api/3/issue/${ticketId}?fields=summary,issuetype`,
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`Jira auth failed (${res.statusCode}) — check your email/token in .tix.json`));
          return;
        }
        if (res.statusCode === 404) {
          reject(new Error(`Ticket ${ticketId} not found (404) — check the ticket ID and that your account has access`));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Jira returned HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Failed to parse Jira response"));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ─── Branch name helpers ──────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // strip anything not alphanumeric, space, or hyphen
    .trim()
    .replace(/[\s]+/g, "-")          // spaces → hyphens
    .replace(/-{2,}/g, "-")          // collapse multiple hyphens
    .replace(/-+$/, "");             // trim trailing hyphens
}

function buildBranchName(prefix, ticketId, summary) {
  return `${prefix}/${ticketId}-${slugify(summary)}`;
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function git(cmd, opts = {}) {
  try {
    const result = execSync(`git ${cmd}`, { encoding: "utf8", stdio: opts.silent ? "pipe" : "inherit" });
    return result ? result.trim() : "";
  } catch (err) {
    if (opts.throws !== false) throw err;
    return null;
  }
}

function ensureGitRepo() {
  const result = git("rev-parse --is-inside-work-tree", { silent: true, throws: false });
  if (result !== "true") {
    console.error("❌  Not inside a git repository");
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const baseBranch = baseBranchOverride || config.defaultBase || "dev";

  console.log(`🔍  Fetching ${ticketId}…`);
  let issue;
  try {
    issue = await fetchTicket(config, ticketId);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  const summary = issue.fields.summary;
  const issueType = issue.fields.issuetype.name.toLowerCase();
  const isBug = issueType.includes("bug");

  let prefix;
  if (isHotfix) {
    prefix = "hotfix";
  } else if (isBug) {
    prefix = "bugfix";
  } else {
    prefix = "feature";
  }

  const branchName = buildBranchName(prefix, ticketId, summary);

  console.log(`📋  ${ticketId}: ${summary}`);
  console.log(`🏷   Type: ${issue.fields.issuetype.name} → ${prefix}/`);
  console.log(`🌿  Branch: ${branchName}`);
  console.log(`📡  Base: ${baseBranch}\n`);

  ensureGitRepo();

  console.log(`⬇️   Fetching latest ${baseBranch}…`);
  git(`fetch origin ${baseBranch}`, { throws: false });

  // Check if branch already exists locally
  const existing = git(`branch --list ${branchName}`, { silent: true, throws: false });
  if (existing) {
    console.error(`⚠️   Branch already exists locally: ${branchName}`);
    console.error(`    Switch to it with: git checkout ${branchName}`);
    process.exit(1);
  }

  git(`checkout -b ${branchName} origin/${baseBranch}`);

  console.log(`\n✅  Done! You're now on: ${branchName}`);
}

main();
