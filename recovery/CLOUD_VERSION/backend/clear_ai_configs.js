
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001';

async function getNotebooks() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/notebooks`);
    if (response.data?.success) {
      return response.data.data || [];
    } else {
      console.error('获取笔记本列表失败:', response.data?.message);
      return [];
    }
  } catch (error) {
    console.error('请求 /api/notebooks 失败:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('请确保后端服务正在运行在 3001 端口');
    }
    return [];
  }
}

async function clearAIConfig(notebookId) {
  try {
    const payload = {
      notebook_id: notebookId,
      chart_config: null
    };
    const response = await axios.post(`${API_BASE_URL}/api/ai-analysis-config`, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.success) {
      console.log(`✅ 成功清空笔记本 ${notebookId} 的历史配置。`);
    } else {
      console.error(`❌ 清空笔记本 ${notebookId} 的配置失败:`, response.data?.message);
    }
  } catch (error) {
    console.error(`❌ 请求清空笔记本 ${notebookId} 的配置失败:`, error.message);
  }
}

async function main() {
  console.log('🚀 开始清空所有非"心情笔记本"的历史图表配置...');

  const notebooks = await getNotebooks();

  if (!notebooks || notebooks.length === 0) {
    console.log('🤷 未找到任何笔记本，或无法连接到后端服务。');
    return;
  }

  const notebooksToClear = notebooks.filter(nb => nb.name !== '心情笔记本');

  if (notebooksToClear.length === 0) {
    console.log('✨ 未找到需要清空配置的笔记本。');
    return;
  }

  console.log(`ℹ️ 找到 ${notebooksToClear.length} 个需要清空配置的笔记本。`);

  for (const notebook of notebooksToClear) {
    await clearAIConfig(notebook.notebook_id);
  }

  console.log('🎉 所有相关笔记本的历史配置已清空。');
}

main();
