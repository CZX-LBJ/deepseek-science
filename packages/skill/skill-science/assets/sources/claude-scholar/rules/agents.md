# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

### Research Workflow

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| literature-reviewer | Literature search, classification, and trend analysis | Starting a new research topic, literature survey |
| rebuttal-writer | Systematic rebuttal writing with tone optimization | Responding to reviewer comments |
| paper-miner | Extract writing knowledge from successful papers | Learning writing patterns from top-venue papers |
| kaggle-miner | Extract engineering practices from Kaggle solutions | Learning competition strategies and pipelines |

### Development Workflow

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| code-reviewer | Code quality, security, and maintainability review | After writing or modifying code |
| tdd-guide | Test-driven development workflow | When the user explicitly wants test-first implementation |

## Automatic Agent Invocation

Use agents proactively without waiting for user request:

1. Code just written/modified → **code-reviewer**
2. New literature survey or topic exploration → **literature-reviewer**
3. Rebuttal drafting → **rebuttal-writer**
4. Writing-pattern mining from strong papers → **paper-miner**
5. Kaggle workflow mining → **kaggle-miner**
6. Explicit test-first implementation request → **tdd-guide**

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: code-reviewer on auth module
2. Agent 2: literature-reviewer on baseline papers
3. Agent 3: paper-miner on a target venue paper

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Error Handling

- If an agent fails or times out, retry once before reporting to user
- Log agent errors for debugging
- Fall back to manual approach if agent is unavailable

## Multi-Perspective Analysis

For complex problems, use split-role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
