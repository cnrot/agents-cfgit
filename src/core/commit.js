import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * 在目标目录检测未提交变更并自动提交
 * @param {object} opts
 * @param {string} opts.cwd - 工作目录（有 .git 的目录）
 * @param {string} [opts.source='hook'] - 触发来源 (pre_tool, pre_shell, post_edit)
 * @param {string} [opts.toolName='unknown'] - 触发工具名
 * @returns {{ committed: boolean, message: string }}
 */
export function commit({ cwd, source = 'hook', toolName = 'unknown' }) {
  if (!existsSync(cwd)) {
    return { committed: false, message: `目录不存在: ${cwd}` };
  }
  if (!existsSync(join(cwd, '.git'))) {
    return { committed: false, message: '不是 git 仓库，跳过提交' };
  }
  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd, encoding: 'utf-8',
    }).trim();
    if (!status) {
      return { committed: false, message: '无未提交变更，跳过' };
    }
    // git status --porcelain 有输出说明存在已追踪文件的变更或未追踪文件
    // gitignore 排除的文件不会出现在 status 输出中
    execFileSync('git', ['add', '.'], { cwd, encoding: 'utf-8' });
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const message = `auto: snapshot before ${toolName} at ${timestamp}`;
    execFileSync('git', [
      '-c', 'user.name=agentcfg',
      '-c', 'user.email=agentcfg@local',
      'commit', '--no-verify', '--no-gpg-sign', '-m', message,
    ], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, GIT_COMMITTER_DATE: new Date().toISOString() },
    });
    return { committed: true, message };
  } catch (err) {
    return { committed: false, message: `git 操作失败: ${err.message}` };
  }
}
