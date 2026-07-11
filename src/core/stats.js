import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { getLog } from './log.js';

/**
 * 聚合统计数据:每日 commit 量 + 文件总数 + 高频文件排行。
 * @param {string} cwd - git 仓库目录
 * @returns {Promise<{
 *   totalCommits: number,
 *   totalFiles: number,
 *   firstDate: string|null,
 *   lastDate: string|null,
 *   dailyActivity: Array<{date: string, fullDate: string, commits: number, filesChanged: number}>,
 *   fileRanking: Array<{file: string, changes: number}>,
 * }>}
 */
export async function buildStats(cwd) {
  if (!existsSync(join(cwd, '.git'))) {
    return emptyStats(countTrackedFiles(cwd));
  }

  // 取全部 commit(最多 10000 条防止极端仓库撑爆)
  const all = getLog({ cwd, count: 10000 });
  if (all.length === 0) {
    return emptyStats(countTrackedFiles(cwd));
  }

  // 按天聚合 commits
  const dayMap = new Map();
  for (const c of all) {
    const fullDate = c.date.slice(0, 10);
    if (!dayMap.has(fullDate)) {
      dayMap.set(fullDate, { date: fullDate.slice(5), fullDate, commits: 0, filesChanged: 0 });
    }
    dayMap.get(fullDate).commits += 1;
  }

  // 一次 git log 拿所有 commit 的 (date, file) 对,按天去重统计
  const fileChanges = collectPerDayFiles(cwd, all.length);
  for (const [fullDate, uniqueFiles] of fileChanges.dailyFiles) {
    if (dayMap.has(fullDate)) {
      dayMap.get(fullDate).filesChanged = uniqueFiles.size;
    }
  }

  const dailyActivity = Array.from(dayMap.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  const fileRanking = fileChanges.top;

  return {
    totalCommits: all.length,
    totalFiles: countTrackedFiles(cwd),
    firstDate: all[all.length - 1]?.date.slice(0, 10) || null,  // git log 默认倒序,最后一个是最早
    lastDate: all[0]?.date.slice(0, 10) || null,                // 第一个是最近
    dailyActivity,
    fileRanking,
  };
}

function emptyStats(fileCount) {
  return { totalCommits: 0, totalFiles: fileCount, firstDate: null, lastDate: null, dailyActivity: [], fileRanking: [] };
}

/**
 * 统计 git 仓库内被追踪文件总数(等价 `git ls-files | wc -l`)。
 */
function countTrackedFiles(cwd) {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf-8' });
    return out.trim() ? out.trim().split('\n').length : 0;
  } catch {
    return 0;
  }
}

/**
 * 一次 git log 同时拿:
 * - 全局文件变更次数排行(TOP 10)
 * - 按天(YYYY-MM-DD)分组的唯一文件集合(供 buildStats 计算 filesChanged)
 */
function collectPerDayFiles(cwd, limit) {
  try {
    // %H|%ci → commit hash + ISO date;空行分隔 commit;然后 --name-only 列文件
    const out = execFileSync('git', [
      'log', `--max-count=${limit}`, '--name-only', '--pretty=format:%H|%ci',
    ], { cwd, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });

    const counts = new Map();         // file → 修改次数
    const dailyFiles = new Map();     // fullDate(YYYY-MM-DD) → Set<file>
    let currentDate = null;

    for (const raw of out.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.includes('|')) {
        // %H|%ci 头
        const parts = line.split('|');
        currentDate = (parts[1] || '').slice(0, 10) || null;
        continue;
      }
      if (!currentDate) continue;     // 没有 commit 头时跳过(异常防御)
      // 文件名
      counts.set(line, (counts.get(line) || 0) + 1);
      if (!dailyFiles.has(currentDate)) dailyFiles.set(currentDate, new Set());
      dailyFiles.get(currentDate).add(line);
    }

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, changes]) => ({ file, changes }));
    return { top, dailyFiles };
  } catch {
    return { top: [], dailyFiles: new Map() };
  }
}
