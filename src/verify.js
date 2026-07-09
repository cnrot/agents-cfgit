import { execFileSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { detectAgents } from './install.js';

/**
 * 验证指定目录的 agentcfg 安装是否完整
 * @param {string} agentType - claude / cursor / codex / opencode
 * @param {string} agentDir - 配置目录绝对路径
 * @returns {Array<{label: string, ok: boolean, detail: string}>}
 */
export function verifyAgent(agentType, agentDir) {
  const checks = [];

  // 1. .git 存在
  const gitDir = join(agentDir, '.git');
  checks.push({
    label: `${agentType}: .git 仓库`,
    ok: existsSync(gitDir),
    detail: existsSync(gitDir) ? gitDir : '未找到',
  });

  // 2. .gitignore 存在
  const gitignorePath = join(agentDir, '.gitignore');
  checks.push({
    label: `${agentType}: .gitignore`,
    ok: existsSync(gitignorePath),
    detail: existsSync(gitignorePath) ? gitignorePath : '未找到',
  });

  // 3. 至少 1 个 commit
  let commitCount = 0;
  let firstCommitMsg = '';
  if (existsSync(gitDir)) {
    try {
      const out = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
        cwd: agentDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      commitCount = parseInt(out, 10) || 0;
      if (commitCount > 0) {
        firstCommitMsg = execFileSync('git', ['log', '--format=%s', '-1'], {
          cwd: agentDir, encoding: 'utf-8',
        }).trim();
      }
    } catch { /* 非 git 仓库 */ }
  }
  checks.push({
    label: `${agentType}: 至少 1 个 commit`,
    ok: commitCount > 0,
    detail: commitCount > 0
      ? `${commitCount} 个 commit（最新: ${firstCommitMsg}）`
      : '无 commit',
  });

  // 4. hooks 注册（按 agent 类型检查）
  const hookCheck = checkHookRegistration(agentType, agentDir);
  checks.push(hookCheck);

  // 5. SKILL.md 安装
  const skillPath = join(agentDir, 'skills/agentcfg/SKILL.md');
  // OpenCode 的 SKILL.md 安装路径与其他不同（实际由 install.js 走同逻辑）
  const skillOk = existsSync(skillPath);
  checks.push({
    label: `${agentType}: SKILL.md`,
    ok: skillOk,
    detail: skillOk ? skillPath : '未安装',
  });

  return checks;
}

/**
 * 检查 hook 注册情况
 */
function checkHookRegistration(agentType, agentDir) {
  const label = `${agentType}: hook 注册`;
  try {
    if (agentType === 'claude') {
      const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf-8'));
      const hasHook = settings.hooks?.PreToolUse?.some(h =>
        h.hooks?.some(hk => hk.command?.includes('commit.js') || hk.command?.includes('agentcfg commit'))
      );
      return { label, ok: !!hasHook, detail: hasHook ? '已注册' : '未注册' };
    }
    if (agentType === 'cursor') {
      const hooks = JSON.parse(readFileSync(join(agentDir, 'hooks.json'), 'utf-8'));
      const hasHook = hooks.hooks?.beforeShellExecution?.some(h => h.command?.includes('commit.js'))
        || hooks.hooks?.afterFileEdit?.some(h => h.command?.includes('commit.js'));
      return { label, ok: !!hasHook, detail: hasHook ? '已注册' : '未注册' };
    }
    if (agentType === 'codex') {
      const hooks = JSON.parse(readFileSync(join(agentDir, 'hooks.json'), 'utf-8'));
      const hasHook = hooks.hooks?.PreToolUse?.some(e =>
        e.hooks?.some(h => h.command?.includes('commit.js'))
      );
      let featureOk = false;
      try {
        const toml = readFileSync(join(agentDir, 'config.toml'), 'utf-8');
        featureOk = /^\[features\]\s*$/m.test(toml) && /^hooks\s*=\s*true\s*$/m.test(toml);
      } catch { /* */ }
      return {
        label: `${agentType}: hook + feature flag`,
        ok: !!hasHook && featureOk,
        detail: `hook=${hasHook ? '✓' : '✗'} feature=${featureOk ? '✓' : '✗'}`,
      };
    }
    if (agentType === 'opencode') {
      const pluginPath = join(agentDir, 'plugins/agentcfg.ts');
      return {
        label,
        ok: existsSync(pluginPath),
        detail: existsSync(pluginPath) ? pluginPath : '插件文件未找到',
      };
    }
  } catch (err) {
    return { label, ok: false, detail: `检查失败: ${err.message}` };
  }
  return { label, ok: false, detail: '未知 agent 类型' };
}

/**
 * 验证所有检测到的 agent 安装
 * @returns {{ agents: Array, allOk: boolean }}
 */
export function verifyAll() {
  const agents = detectAgents();
  const results = agents.map(a => ({
    agent: a,
    checks: verifyAgent(a.type, a.dir),
  }));
  const allOk = results.length > 0 && results.every(r => r.checks.every(c => c.ok));
  return { agents, results, allOk };
}
