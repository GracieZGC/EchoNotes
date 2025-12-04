import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'backend-v2 running' });
});

// TODO: 之后在这里逐步添加 /api/notebooks、/api/analyses 等真实接口

app.listen(PORT, () => {
  console.log(`[backend-v2] listening on http://localhost:${PORT}`);
});


