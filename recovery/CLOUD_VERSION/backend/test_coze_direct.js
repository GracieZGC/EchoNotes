#!/usr/bin/env node

/**
 * 直接测试 Coze API，验证后端环境变量是否正确
 */

import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量（使用与 server.js 相同的逻辑）
const envPaths = [
  path.join(__dirname, '../../.env.local'),      // 从 backend 到 CLOUD_VERSION
  path.join(__dirname, '../../../.env.local'),   // 从 backend 到项目根目录
  path.join(__dirname, '.env.local'),           // backend 目录
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
  console.warn('⚠️ 未找到 .env.local 文件');
  dotenv.config();
}

const COZE_API_KEY = (process.env.COZE_API_KEY || process.env.COZE_SERVICE_IDENTITY || '').trim();
const COZE_WORKFLOW_ID = (process.env.COZE_WORKFLOW_ID || process.env.COZE_BOT_ID || '').trim();

console.log('\n' + '='.repeat(60));
console.log('🧪 直接测试 Coze API（使用后端环境变量）');
console.log('='.repeat(60));
console.log(`COZE_API_KEY 前缀: ${COZE_API_KEY ? COZE_API_KEY.substring(0, 15) + '...' : '未配置'}`);
console.log(`COZE_API_KEY 长度: ${COZE_API_KEY.length || 0}`);
console.log(`COZE_API_KEY 格式: ${COZE_API_KEY.startsWith('pat_') ? '✓ pat_ 格式' : '⚠️ 非 pat_ 格式'}`);
console.log(`COZE_WORKFLOW_ID: ${COZE_WORKFLOW_ID || '未配置'}`);
console.log(`COZE_BOT_ID: ${process.env.COZE_BOT_ID || '未配置'}`);
console.log('='.repeat(60) + '\n');

if (!COZE_API_KEY || !COZE_WORKFLOW_ID) {
  console.error('❌ 缺少必要的配置');
  process.exit(1);
}

const testPayload = {
  bot_id: COZE_WORKFLOW_ID,
  user_id: 'test_direct',
  stream: false,
  additional_messages: [{
    role: 'user',
    content: '请解析 https://wallstreetcn.com/articles/3760816',
    content_type: 'text'
  }]
};

console.log('📤 发送请求到 Coze API...');
console.log(`URL: https://api.coze.cn/v3/chat`);
console.log(`Bot ID: ${COZE_WORKFLOW_ID}\n`);

try {
  const response = await axios.post('https://api.coze.cn/v3/chat', testPayload, {
    headers: {
      Authorization: `Bearer ${COZE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000,
    validateStatus: () => true // 接受所有状态码
  });

  console.log(`📊 响应状态码: ${response.status}`);
  console.log(`📄 Content-Type: ${response.headers['content-type'] || '未知'}`);
  console.log(`📦 响应体长度: ${JSON.stringify(response.data).length} 字符\n`);

  if (response.status === 200) {
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const dataStr = JSON.stringify(response.data, null, 2);
      console.log('✅ 返回 JSON 响应:');
      console.log(dataStr.substring(0, 500));
      
      // 检查响应内容是否是 HTML（即使 Content-Type 是 JSON）
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
        console.log('\n⚠️ 警告：响应体包含 HTML！');
      } else if (response.data?.code === 0) {
        console.log('\n✓ 授权成功，API 调用正常');
      } else if (response.data?.code === 4101) {
        console.log('\n❌ Token 无效');
      } else {
        console.log('\n⚠️ 未知响应格式');
      }
    } else if (contentType.includes('text/html')) {
      console.log('❌ 返回了 HTML 页面（登录页）');
      console.log(response.data.substring(0, 500));
    } else {
      console.log('⚠️ 未知的 Content-Type');
    }
  } else {
    console.log(`❌ 请求失败: ${response.status}`);
    console.log(JSON.stringify(response.data, null, 2).substring(0, 500));
  }
} catch (error) {
  console.error('❌ 请求异常:', error.message);
  if (error.response) {
    console.error('状态码:', error.response.status);
    console.error('响应:', error.response.data);
  }
}