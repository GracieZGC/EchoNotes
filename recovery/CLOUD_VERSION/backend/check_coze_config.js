#!/usr/bin/env node

/**
 * Coze API 配置检查脚本
 * 用于诊断 Coze API 授权问题
 */

import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量（使用与 server.js 相同的逻辑）
const envPaths = [
  path.join(__dirname, '../../../../.env.local'), // 从 backend 到项目根目录
  path.join(__dirname, '../../.env.local'),      // 从 backend 到 CLOUD_VERSION
  path.join(__dirname, '.env.local'),           // backend 目录
  '/Users/guanchenzhan/Desktop/VSCODE/个人网站/.env.local' // 绝对路径
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath, override: true });
  if (!result.error) {
    console.log(`✓ 从 ${envPath} 加载环境变量`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('⚠️ 未找到 .env.local 文件，尝试加载默认 .env');
  dotenv.config(); // 如果 .env.local 不存在，则加载默认的 .env
}

const COZE_API_KEY = (process.env.COZE_API_KEY || process.env.COZE_SERVICE_IDENTITY || '').trim();
const COZE_WORKFLOW_ID = (process.env.COZE_WORKFLOW_ID || process.env.COZE_BOT_ID || '').trim();
const COZE_WEBHOOK_URL = (process.env.COZE_WEBHOOK_URL || '').trim();

console.log('='.repeat(60));
console.log('🔍 Coze API 配置检查');
console.log('='.repeat(60));

// 检查 API Key
console.log('\n📋 API Key 检查:');
if (!COZE_API_KEY) {
  console.log('  ❌ COZE_API_KEY 未配置');
} else {
  console.log(`  ✓ COZE_API_KEY 已配置`);
  console.log(`  - 长度: ${COZE_API_KEY.length} 字符`);
  console.log(`  - 前缀: ${COZE_API_KEY.substring(0, 10)}...`);
  console.log(`  - 格式检查: ${COZE_API_KEY.startsWith('pat_') ? '✓ 正确 (pat_...)' : '⚠️ 不是 pat_ 格式'}`);
  
  // 检查是否有空格或引号
  const trimmed = COZE_API_KEY.trim();
  if (trimmed !== COZE_API_KEY) {
    console.log('  ⚠️ 检测到前后空格');
  }
  if (COZE_API_KEY.includes('"') || COZE_API_KEY.includes("'")) {
    console.log('  ⚠️ 检测到引号，可能配置错误');
  }
}

// 检查 Bot ID
console.log('\n📋 Bot ID 检查:');
if (!COZE_WORKFLOW_ID) {
  console.log('  ❌ COZE_WORKFLOW_ID 或 COZE_BOT_ID 未配置');
} else {
  console.log(`  ✓ Bot ID 已配置: ${COZE_WORKFLOW_ID}`);
}

// 检查 Webhook URL
console.log('\n📋 Webhook URL 检查:');
if (!COZE_WEBHOOK_URL) {
  console.log('  ℹ️ COZE_WEBHOOK_URL 未配置（将使用 API 方式）');
} else {
  console.log(`  ✓ Webhook URL 已配置: ${COZE_WEBHOOK_URL.substring(0, 50)}...`);
}

// 测试 API 调用（如果配置了）
if (COZE_API_KEY && COZE_WORKFLOW_ID) {
  console.log('\n🧪 测试 API 调用:');
  console.log('  正在测试 Coze API 授权...');
  
  const testPayload = {
    bot_id: COZE_WORKFLOW_ID,
    user_id: 'test_user',
    stream: false,
    additional_messages: [{
      role: 'user',
      content: 'test',
      content_type: 'text'
    }]
  };
  
  axios.post('https://api.coze.cn/v3/chat', testPayload, {
    headers: {
      Authorization: `Bearer ${COZE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000,
    validateStatus: () => true // 接受所有状态码以便检查
  })
  .then(response => {
    console.log(`  📊 响应状态码: ${response.status}`);
    console.log(`  📄 Content-Type: ${response.headers['content-type'] || '未知'}`);
    
    if (response.status === 401 || response.status === 403) {
      console.log('  ❌ 授权失败: 状态码 ' + response.status);
      console.log('  💡 可能原因:');
      console.log('    1. API Key 格式错误或已过期');
      console.log('    2. PAT 没有 chat 权限');
      console.log('    3. Bot ID 与 PAT 所属 workspace 不一致');
    } else if (response.status === 200) {
      console.log('  ✓ 授权成功！');
    } else if (response.headers['content-type']?.includes('text/html')) {
      console.log('  ❌ 返回了 HTML 页面（通常是登录页）');
      console.log('  💡 说明请求被当作未授权处理');
    } else {
      console.log(`  ⚠️ 未知状态码: ${response.status}`);
    }
  })
  .catch(error => {
    if (error.response) {
      console.log(`  ❌ 请求失败: ${error.response.status} ${error.response.statusText}`);
      console.log(`  📄 Content-Type: ${error.response.headers['content-type'] || '未知'}`);
    } else {
      console.log(`  ❌ 请求失败: ${error.message}`);
    }
  });
} else {
  console.log('\n⚠️ 无法测试 API 调用：缺少必要的配置');
}

console.log('\n' + '='.repeat(60));
console.log('💡 诊断建议:');
console.log('  1. 确认 COZE_API_KEY 格式为 pat_...');
console.log('  2. 确认 PAT 在 Coze 控制台有 chat 权限');
console.log('  3. 确认 BOT_ID 与 PAT 属于同一个 workspace');
console.log('  4. 如果使用个人版 PAT 调用企业/团队 bot，会被拒绝');
console.log('  5. 可以尝试使用 webhook 方式绕过 bot chat 调用');
console.log('='.repeat(60));

