import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../apiClient';
import AnalysisDetailPage from '../components/AnalysisDetailPage';

function AnalysisResultByNotebook({ notebookId }: { notebookId: string }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalysis = async () => {
      try {
        const resp = await apiClient.getAnalyses();
        const list = resp?.data || [];
        const latest = list.find((item: any) => item.notebookId === notebookId);
        if (latest?.id) {
          setAnalysisId(latest.id);
        } else {
          console.warn('未找到该笔记本的分析结果');
        }
      } catch (error) {
        console.error('加载分析结果失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAnalysis();
  }, [notebookId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#06c3a8] mx-auto mb-4" />
          <p className="text-gray-600">加载分析结果中...</p>
        </div>
      </div>
    );
  }

  if (!analysisId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">未找到该笔记本的分析结果</p>
          <button
            onClick={() => navigate(`/AnalysisPage/Select/${notebookId}`)}
            className="px-4 py-2 bg-[#06c3a8] text-white rounded-lg hover:bg-[#04b094]"
          >
            创建新分析
          </button>
        </div>
      </div>
    );
  }

  return <AnalysisDetailPage analysisIdOverride={analysisId} />;
}

export default AnalysisResultByNotebook;

