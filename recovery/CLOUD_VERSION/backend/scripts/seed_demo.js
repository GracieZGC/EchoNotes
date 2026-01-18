import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDbPath = path.resolve(__dirname, '../demo.db');
const resolvedDbPath = process.env.DB_PATH ? String(process.env.DB_PATH) : defaultDbPath;
if (!process.env.DB_PATH) process.env.DB_PATH = resolvedDbPath;
if (typeof process.env.USE_TURSO === 'undefined') process.env.USE_TURSO = 'false';

const nowIso = () => new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const keyLen = 32;
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, { N, r, p }, (err, dk) => {
      if (err) reject(err);
      else resolve(dk);
    });
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`;
};

const DEMO_USER = {
  email: 'demo@local.test',
  name: '演示账号',
  password: 'Demo1234!'
};

const DEMO_NOTEBOOKS = [
  { id: 'nb_demo_mood', name: '心情', description: '记录每日情绪与触发因素' },
  { id: 'nb_demo_fitness', name: '健身', description: '训练计划与身体反馈' },
  { id: 'nb_demo_inspiration', name: '灵感', description: '灵感碎片与创意收集' },
  { id: 'nb_demo_ai', name: 'AI', description: 'AI 资讯与工具观察' }
];

const DEMO_NOTES = [
  {
    id: 'note_demo_mood_1',
    notebookId: 'nb_demo_mood',
    title: '上午被临时任务打断，有点焦虑',
    content: '本来安排好的节奏被打乱，心里有点慌，想把事情先梳理一遍。',
    createdAt: daysAgo(8),
    componentData: {
      mood_category: '焦虑',
      mood_score: -2,
      mood_source: '工作',
      mood_keywords: ['焦虑', '打断', '节奏']
    }
  },
  {
    id: 'note_demo_mood_2',
    notebookId: 'nb_demo_mood',
    title: '中午和朋友吃饭，心情放松',
    content: '聊了近况，感觉被理解，心里轻松了不少。',
    createdAt: daysAgo(6),
    componentData: {
      mood_category: '放松',
      mood_score: 3,
      mood_source: '朋友',
      mood_keywords: ['放松', '陪伴', '聊天']
    }
  },
  {
    id: 'note_demo_mood_3',
    notebookId: 'nb_demo_mood',
    title: '晚上运动后很开心',
    content: '跑完步出了一身汗，情绪明显变好了。',
    createdAt: daysAgo(4),
    componentData: {
      mood_category: '开心',
      mood_score: 4,
      mood_source: '健身',
      mood_keywords: ['开心', '运动', '释放']
    }
  },
  {
    id: 'note_demo_mood_4',
    notebookId: 'nb_demo_mood',
    title: '周末整理房间，情绪平静',
    content: '把桌面和抽屉整理干净，感觉心里也更清晰。',
    createdAt: daysAgo(3),
    componentData: {
      mood_category: '平静',
      mood_score: 0,
      mood_source: '生活',
      mood_keywords: ['平静', '整理', '清爽']
    }
  },
  {
    id: 'note_demo_mood_5',
    notebookId: 'nb_demo_mood',
    title: '项目推进顺利，情绪积极',
    content: '和团队沟通很顺畅，事情在按计划推进。',
    createdAt: daysAgo(1),
    componentData: {
      mood_category: '积极',
      mood_score: 2,
      mood_source: '工作',
      mood_keywords: ['积极', '进展', '团队']
    }
  },
  {
    id: 'note_demo_fit_1',
    notebookId: 'nb_demo_fitness',
    title: '上肢力量训练',
    content: '俯卧撑 4 组、哑铃推举 3 组、划船 3 组，最后拉伸。',
    createdAt: daysAgo(9)
  },
  {
    id: 'note_demo_fit_2',
    notebookId: 'nb_demo_fitness',
    title: '腿部训练与恢复',
    content: '深蹲 4 组、硬拉 3 组，泡沫轴放松 10 分钟。',
    createdAt: daysAgo(7)
  },
  {
    id: 'note_demo_fit_3',
    notebookId: 'nb_demo_fitness',
    title: '有氧慢跑',
    content: '30 分钟慢跑 + 5 分钟拉伸，心率保持在 140 左右。',
    createdAt: daysAgo(5)
  },
  {
    id: 'note_demo_fit_4',
    notebookId: 'nb_demo_fitness',
    title: '核心训练',
    content: '平板支撑 3 组、卷腹 4 组，注意呼吸节奏。',
    createdAt: daysAgo(2)
  },
  {
    id: 'note_demo_idea_1',
    notebookId: 'nb_demo_inspiration',
    title: '内容结构的三段式',
    content: '开头提出问题 → 中段给出对比 → 结尾给出行动建议。',
    createdAt: daysAgo(10)
  },
  {
    id: 'note_demo_idea_2',
    notebookId: 'nb_demo_inspiration',
    title: '产品首页的“状态提醒”',
    content: '把最近一次分析结论放在首页卡片，提醒用户继续记录。',
    createdAt: daysAgo(6)
  },
  {
    id: 'note_demo_idea_3',
    notebookId: 'nb_demo_inspiration',
    title: '情绪趋势可视化',
    content: '用折线展示情绪分数，并在关键日期标注事件。',
    createdAt: daysAgo(3)
  },
  {
    id: 'note_demo_ai_1',
    notebookId: 'nb_demo_ai',
    title: '多模态模型进展',
    content: '关注模型在图像理解与文字生成的统一推理能力。',
    createdAt: daysAgo(11)
  },
  {
    id: 'note_demo_ai_2',
    notebookId: 'nb_demo_ai',
    title: 'Agent 工作流案例',
    content: '把任务拆解成检索-整理-产出的多步骤链路。',
    createdAt: daysAgo(7)
  },
  {
    id: 'note_demo_ai_3',
    notebookId: 'nb_demo_ai',
    title: '评估标准整理',
    content: '记录模型输出的准确率、可解释性、成本与延迟。',
    createdAt: daysAgo(4)
  },
  {
    id: 'note_demo_ai_4',
    notebookId: 'nb_demo_ai',
    title: 'Prompt 模板想法',
    content: '引导模型先给结论，再给理由，最后给行动项。',
    createdAt: daysAgo(1)
  }
];

const main = async () => {
  const { primary: db } = await initDB();
  const now = nowIso();

  const tablesToClear = [
    'notes',
    'notebooks',
    'analysis_results',
    'ai_analysis_setting',
    'notebook_field_templates',
    'field_template_preferences',
    'ai_field_definitions',
    'ai_field_values',
    'article_parse_history',
    'auth_sessions',
    'auth_tokens',
    'auth_oauth_accounts',
    'auth_users'
  ];

  for (const table of tablesToClear) {
    await db.run(`DELETE FROM ${table}`);
  }

  const existing = await db.get('SELECT id FROM auth_users WHERE email = ?', [DEMO_USER.email]);
  const userId = existing?.id || 'u_demo';
  const passwordHash = await hashPassword(DEMO_USER.password);
  if (existing?.id) {
    await db.run(
      `UPDATE auth_users SET name = ?, password_hash = ?, email_verified = 1, updated_at = ? WHERE id = ?`,
      [DEMO_USER.name, passwordHash, now, userId]
    );
  } else {
    await db.run(
      `INSERT INTO auth_users (id, email, name, password_hash, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [userId, DEMO_USER.email, DEMO_USER.name, passwordHash, now, now]
    );
  }

  for (const nb of DEMO_NOTEBOOKS) {
    await db.run(
      `INSERT OR REPLACE INTO notebooks (notebook_id, name, description, note_count, component_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nb.id, nb.name, nb.description, 0, null, now, now]
    );
  }

  for (const note of DEMO_NOTES) {
    await db.run(
      `INSERT OR REPLACE INTO notes (
        note_id, notebook_id, title, content_text, images, image_urls, source_url, source, original_url, author, upload_time,
        component_data, component_instances, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        note.id,
        note.notebookId,
        note.title,
        note.content,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        note.componentData ? JSON.stringify(note.componentData) : null,
        null,
        note.createdAt,
        note.createdAt
      ]
    );
  }

  for (const nb of DEMO_NOTEBOOKS) {
    const countRow = await db.get('SELECT COUNT(*) as count FROM notes WHERE notebook_id = ?', [nb.id]);
    const count = countRow?.count || 0;
    await db.run('UPDATE notebooks SET note_count = ?, updated_at = ? WHERE notebook_id = ?', [count, now, nb.id]);
  }
  console.log(`✅ Demo 数据已生成: ${resolvedDbPath}`);
  console.log(`✅ Demo 账号: ${DEMO_USER.email} / ${DEMO_USER.password}`);
};

main().catch((err) => {
  console.error('❌ Demo 数据生成失败:', err);
  process.exit(1);
});
