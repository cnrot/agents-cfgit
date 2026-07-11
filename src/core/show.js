import { execFileSync } from 'child_process';

/**
 * 解析 `git show <hash>` 的输出,按文件分组成结构化 diff。
 * @param {object} opts
 * @param {string} opts.cwd - git 仓库目录
 * @param {string} opts.hash - 完整或短 commit hash
 * @returns {{ hash: string, files: Array<{name: string, status: 'A'|'M'|'D', lines: Array<{line: string, type: 'n'|'a'|'d'}>, startLine: number}> }}
 */
export function parseShow({ cwd, hash }) {
  const raw = execFileSync('git', [
    'show', '--format=', '--no-color', '--no-renames', hash,
  ], { cwd, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });

  return { hash: hash.slice(0, 8), files: splitByFile(raw) };
}

/**
 * 把 `git show` 的纯文本按 diff --git a/... b/... 分块。
 * @param {string} raw
 * @returns {Array<{name: string, status: 'A'|'M'|'D', lines: Array<{line: string, type: 'n'|'a'|'d'}>, startLine: number}>}
 */
export function splitByFile(raw) {
  if (!raw.trim()) return [];
  const lines = raw.split('\n');
  const files = [];
  let current = null;
  let oldStart = 1;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current);
      const m = line.match(/^diff --git a\/.+ b\/(.+)$/);
      current = {
        name: m ? m[1] : '',
        status: 'M',
        lines: [],
        startLine: 1,
        _hunkHeaderSeen: false,
      };
      continue;
    }
    if (!current) continue;

    if (/^new file mode/.test(line)) { current.status = 'A'; continue; }
    if (/^deleted file mode/.test(line)) { current.status = 'D'; continue; }
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) continue;
    if (line === '--- /dev/null' || line === '+++ /dev/null') continue;
    if (line.startsWith('index ')) continue;
    if (line.startsWith('rename ') || line.startsWith('similarity ') || line.startsWith('Binary files')) continue;
    if (/^\d+ file.*changed/.test(line)) continue;

    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        current._hunkHeaderSeen = true;
        oldStart = parseInt(m[1], 10);
        current.startLine = oldStart;
      }
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({ line: line.slice(1), type: 'a' });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({ line: line.slice(1), type: 'd' });
    } else if (line.startsWith(' ')) {
      current.lines.push({ line: line.slice(1), type: 'n' });
    } else if (line === '\\ No newline at end of file') {
      continue;
    } else if (line.trim() === '') {
      continue;
    }
  }
  if (current) files.push(current);
  for (const f of files) delete f._hunkHeaderSeen;
  return files;
}
