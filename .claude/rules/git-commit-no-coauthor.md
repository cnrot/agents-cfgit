# Git commit message 规则

所有 git commit message **不得**包含以下内容:
- `Co-Authored-By: Claude`
- `Co-Authored-By: Anthropic`
- 任何指向 Claude / Anthropic 的合作者署名

**Why**: 用户明确要求:本项目所有 git 提交中不要包含 Co-Authored-By Claude Opus 4.7。已因此在 7494199 撤回了含此签名的提交 33f9d03。

**How to apply**: 使用 git commit 时,确保 message body **不**含 `Co-Authored-By: Claude ...` 行。包括但不限于:
- `git commit -m "..."` 写裸 message
- HEREDOC 形式的 `git commit -m "$(cat <<'EOF' ... EOF)` 不要在末尾加 Co-Authored 段
- 即使 Claude / Claude Code 帮忙写的代码,也不在 commit 里署名

