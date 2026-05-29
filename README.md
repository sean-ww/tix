# tix

CLI tool to create git branches from Jira tickets.

```
tix CL-1234
```

Fetches the ticket, determines the branch type, pulls the latest base branch, and checks out a new branch — all in one command.

## Branch naming

| Ticket type | Command | Branch |
|-------------|---------|--------|
| Bug | `tix CL-1234` | `bugfix/CL-1234-ticket-title` |
| Any other | `tix CL-1234` | `feature/CL-1234-ticket-title` |
| Any | `tix CL-1234 --hotfix` | `hotfix/CL-1234-ticket-title` |

Ticket titles are slugified — lowercased, special characters stripped, spaces replaced with hyphens.

## Options

```
tix <TICKET-ID> [options]

Options:
  --hotfix        Force hotfix/ prefix
  --base <branch> Branch from <branch> instead of the configured default
  -h, --help      Show help
```

## Setup

### 1. Clone and alias

```bash
git clone git@github.com:sean-ww/tix.git
```

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias tix="node /path/to/tix/tix.js"
```

### 2. Configure

Copy the example config and fill in your details:

```bash
cp .tix.json.example ~/.tix.json   # or keep it in the tix directory
```

```json
{
  "jiraHost": "yourcompany.atlassian.net",
  "jiraEmail": "you@example.com",
  "jiraToken": "YOUR_API_TOKEN",
  "defaultBase": "dev"
}
```

Generate a Jira API token at: https://id.atlassian.net/manage-profile/security/api-tokens

The config file is gitignored — your credentials stay local.

## Requirements

- Node.js (no external dependencies)
- Git
