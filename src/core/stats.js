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

  const all = getLog({ cwd, count: 10000 });
  if (all.length === 0) {
    return emptyStats(countTrackedFiles(cwd));
  }

  const dayMap = new Map();
  for (const c of all) {
    const fullDate = c.date.slice(0, 10);
    if (!dayMap.has(fullDate)) {
      dayMap.set(fullDate, { date: fullDate.slice(5), fullDate, commits: 0, filesChanged: 0 });
    }
    dayMap.get(fullDate).commits += 1;
  }

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
    firstDate: all[all.length - 1]?.date.slice(0, 10) || null,
    lastDate: all[0]?.date.slice(0, 10) || null,
    dailyActivity,
    fileRanking,
  };
}

function emptyStats(fileCount) {
  return { totalCommits: 0, totalFiles: fileCount, firstDate: null, lastDate: null, dailyActivity: [], fileRanking: [] };
}

function countTrackedFiles(cwd) {
  try {
    const out = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf-8' });
    return out.trim() ? out.trim().split('\n').length : 0;
  } catch {
    return 0;
  }
}

function collectPerDayFiles(cwd, limit) {
  try {
    const out = execFileSync('git', [
      'log', `--max-count=${limit}`, '--name-only', '--pretty=format:%H|%ci',
    ], { cwd, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });

    const counts = new Map();
    const dailyFiles = new Map();
    let currentDate = null;

    for (const raw of out.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.includes('|')) {
        const parts = line.split('|');
        currentDate = (parts[1] || '').slice(0, 10) || null;
        continue;
      }
      if (!currentDate) continue;
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
