#!/usr/bin/env node

const [,, command, ...args] = process.argv;

const commands = {
  init: async () => {
    const { default: install } = await import('../src/install.js');
    await install();
  },
  uninstall: async () => {
    const { default: uninstall } = await import('../src/uninstall.js');
    await uninstall();
  },
  recover: async () => {
    const { default: recover } = await import('../src/recover.js');
    await recover(args[0]);
  },
};

if (commands[command]) {
  commands[command]().catch(err => {
    console.error('config-mgr 错误:', err.message);
    process.exit(1);
  });
} else {
  console.log('用法: config-mgr <init|uninstall|recover>');
  console.log('  init       安装 config-mgr 到当前 AI 工具环境');
  console.log('  uninstall  卸载 config-mgr');
  console.log('  recover    查看历史或恢复配置（对话式引导）');
}
