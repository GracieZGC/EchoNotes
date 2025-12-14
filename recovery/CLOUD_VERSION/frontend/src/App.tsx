import { useState, useEffect, useCallback, useRef } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import apiClient, { type Notebook } from './apiClient'
import AINoteImportPage from './components/AINoteImportPage'
import CreateNote from './components/CreateNote'
import AnalysisListPage from './components/AnalysisListPage'
import NotesPage from './components/NotesPage'
import LandingPage from './landing/LandingPage'
import NoteDetailPage from './components/NoteDetailPage'
import AnalysisDetailPage from './components/AnalysisDetailPage'
import AnalysisSettingV2Page from './components/AnalysisSettingV2Page'
import TypeNotesPage from './components/TypeNotesPage'
import useCodeCopyButtons from './hooks/useCodeCopyButtons'

type TabId = 'creatnote' | 'ai-import' | 'analysis-list'
type ViewType =
  | 'category'
  | 'notes'
  | 'ai-import'
  | 'analysis-list'
  | 'analysis-setting-v2'
  | 'analysis-detail'

function App() {
  useCodeCopyButtons()
  return (
    <div className="min-h-screen bg-[#eef6fd]">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/typenotes" element={<TypeNotesPage />} />
        <Route path="/app" element={<AppContent />} />
        <Route path="/CreateNote" element={<AppContent />} />
        <Route path="/ai-import" element={<AppContent />} />
        <Route path="/analysis" element={<AppContent />} />
        <Route path="/analysis/" element={<AppContent />} />
        {/* 新版分析 V2 入口 */}
        <Route path="/analysis/v2" element={<AppContent />} />
        <Route path="/analysis/v2/:notebookId" element={<AppContent />} />
        {/* 兼容旧的双斜杠路径 */}
        <Route path="/analysis//" element={<AppContent />} />
        <Route path="/analysis//:notebookId" element={<AppContent />} />
        <Route path="/analysis/settingV2/:noteid" element={<AppContent />} />
        <Route path="/notes" element={<AppContent />} />
        <Route path="/notes/:notebookId" element={<AppContent />} />
        <Route path="/note/:noteId" element={<NoteDetailPage />} />
        <Route path="/analysis/:analysisId" element={<AppContent />} />
      </Routes>
    </div>
  )
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(false) // 改为 false，立即显示页面
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewType>('category')
  const [active, setActive] = useState<TabId>('creatnote')
  const [createOpen, setCreateOpen] = useState(true)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null)
  const [analysisDetailId, setAnalysisDetailId] = useState<string | null>(null)
  const [navMenuOpenId, setNavMenuOpenId] = useState<string | null>(null)
  const navMenuCloseTimer = useRef<number | null>(null)

  const clearNavMenuCloseTimer = () => {
    if (navMenuCloseTimer.current) {
      clearTimeout(navMenuCloseTimer.current)
      navMenuCloseTimer.current = null
    }
  }

  const scheduleNavMenuClose = useCallback((notebookId?: string) => {
    clearNavMenuCloseTimer()
    navMenuCloseTimer.current = window.setTimeout(() => {
      setNavMenuOpenId(current => {
        if (notebookId) {
          return current === notebookId ? null : current
        }
        return null
      })
    }, 120)
  }, [])

  useEffect(() => {
    return () => {
      clearNavMenuCloseTimer()
    }
  }, [])

  const NotebookIcon = (
    <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
      <path d="M781.2 103.6H182.9c-9.7 0-17.6 7.9-17.6 17.6v786c0 9.7 7.9 17.6 17.6 17.6h598.3c42 0 76.3-34.2 76.3-76.3V179.9c-0.1-42.1-34.3-76.3-76.3-76.3z m41 745c0 22.6-18.4 41.1-41.1 41.1H306v-135c0-9.7-7.9-17.6-17.6-17.6s-17.6 7.9-17.6 17.6v134.9h-70.4V138.8h70.4v510.3c0 9.7 7.9 17.6 17.6 17.6s17.6-7.9 17.6-17.6V138.8h475.1c22.6 0 41.1 18.4 41.1 41.1v668.7z" fill="#2D3742"></path>
      <path d="M634.5 308.9H470.3c-9.7 0-17.6 7.9-17.6 17.6s7.9 17.6 17.6 17.6h164.2c9.7 0 17.6-7.9 17.6-17.6s-7.9-17.6-17.6-17.6zM634.5 402.8H470.3c-9.7 0-17.6 7.9-17.6 17.6s7.9 17.6 17.6 17.6h164.2c9.7 0 17.6-7.9 17.6-17.6 0-9.7-7.9-17.6-17.6-17.6z" fill="#2D3742"></path>
    </svg>
  )

  // 锁定 body 滚动，让侧边导航固定，右侧内容独立滚动
  useEffect(() => {
    document.documentElement.classList.add('app-shell')
    document.body.classList.add('app-shell')
    return () => {
      document.documentElement.classList.remove('app-shell')
      document.body.classList.remove('app-shell')
    }
  }, [])

  // 加载笔记本列表（异步，不阻塞页面渲染）
  const loadNotebooks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // 增加超时时间到10秒，并添加 AbortController 支持
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      try {
        const notebookList = await apiClient.getNotebooks()
        clearTimeout(timeoutId)
        setNotebooks(notebookList)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (controller.signal.aborted) {
          throw new Error('请求超时，请检查网络连接或后端服务')
        }
        throw fetchError
      }
    } catch (err: any) {
      console.error('加载笔记本列表失败:', err)
      // 静默失败，使用空列表，允许页面继续显示
      setNotebooks([])
      // 只在控制台显示错误，不阻塞用户
      if (err.message?.includes('超时') || err.message?.includes('网络')) {
        console.warn('⚠️ API 请求超时，使用空列表继续显示页面')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNotebooks()
    
    const handleNotebookCreated = () => {
      loadNotebooks()
    }
    
    window.addEventListener('notebook:created', handleNotebookCreated)
    window.addEventListener('notebooks:refresh', handleNotebookCreated)
    
    return () => {
      window.removeEventListener('notebook:created', handleNotebookCreated)
      window.removeEventListener('notebooks:refresh', handleNotebookCreated)
    }
  }, [loadNotebooks])

  const handleNotebookRename = useCallback(async (notebookId: string) => {
    const target = notebooks.find(nb => nb.notebook_id === notebookId)
    const nextName = window.prompt('重命名笔记本', target?.name || '')
    const trimmed = nextName?.trim()
    if (!trimmed || trimmed === target?.name) return
    try {
      await apiClient.renameNotebook(notebookId, trimmed, target?.description ?? null)
      setNavMenuOpenId(null)
      await loadNotebooks()
      window.dispatchEvent(new Event('notebooks:refresh'))
    } catch (error: any) {
      console.error('重命名笔记本失败:', error)
      alert(error?.message || '重命名失败，请稍后重试')
    }
  }, [notebooks, loadNotebooks])

  const handleNotebookDelete = useCallback(async (notebookId: string) => {
    const target = notebooks.find(nb => nb.notebook_id === notebookId)
    if (!window.confirm(`确定要删除笔记本「${target?.name || notebookId}」吗？此操作会同时删除其中的笔记。`)) {
      return
    }
    const remaining = notebooks.filter(nb => nb.notebook_id !== notebookId)
    try {
      await apiClient.deleteNotebook(notebookId)
      setNavMenuOpenId(null)
      setNotebooks(remaining)
      window.dispatchEvent(new Event('notebooks:refresh'))

      if (activeNotebookId === notebookId) {
        const fallbackId = remaining[0]?.notebook_id || null
        setActiveNotebookId(fallbackId)

        if (view === 'notes') {
          if (fallbackId) {
            navigate(`/notes/${fallbackId}`)
          } else {
            navigate('/notes')
          }
        } else if (view === 'analysis-setting-v2') {
          if (fallbackId) {
            navigate(`/analysis/v2/${fallbackId}`)
          } else {
            navigate('/analysis/v2')
          }
        }
      }

      await loadNotebooks()
    } catch (error: any) {
      console.error('删除笔记本失败:', error)
      alert(error?.message || '删除笔记本失败，请稍后再试')
    }
  }, [notebooks, activeNotebookId, view, navigate, loadNotebooks])

  // 根据路由更新视图
  useEffect(() => {
    const path = location.pathname
    const searchParams = new URLSearchParams(location.search)
    if (path === '/ai-import') {
      setView('ai-import')
      setCreateOpen(true)
      setAnalysisDetailId(null)
    } else if (path === '/analysis' || path === '/analysis/') {
      // 分析管理列表页
      setView('analysis-list')
      setActive('analysis-list')
      setAnalysisOpen(true)
      setAnalysisDetailId(null)
    } else if (path.startsWith('/analysis/v2')) {
      const notebookId = (path.split('/analysis/v2/')[1] || '').split('?')[0] || null
      setView('analysis-setting-v2')
      setActive('analysis-list')
      setAnalysisOpen(true)
      setActiveNotebookId(notebookId || null)
      setAnalysisDetailId(null)
    } else if (path.startsWith('/analysis//')) {
      const notebookId = (path.split('/analysis//')[1] || '').split('?')[0] || null
      setView('analysis-setting-v2')
      setActive('analysis-list')
      setAnalysisOpen(true)
      setActiveNotebookId(notebookId)
      setAnalysisDetailId(null)
    } else if (path.startsWith('/analysis/settingV2/')) {
      const notebookId = (path.split('/analysis/settingV2/')[1] || '').split('?')[0] || null
      setView('analysis-setting-v2')
      setActive('analysis-list')
      setAnalysisOpen(true)
      setActiveNotebookId(notebookId)
      setAnalysisDetailId(null)
    } else if (path.startsWith('/analysis/')) {
      const rawId = path.split('/analysis/')[1] || null
      const stepParam = searchParams.get('step')
      const isFlow = stepParam === 'select' || stepParam === 'setting' || stepParam === 'config' || stepParam === 'result'
      const notebookId = rawId ? rawId.split('/')[0] : null
      if (isFlow) {
        // 流程页：select/setting/result
        setAnalysisDetailId(null)
        setActive('analysis-list')
        setAnalysisOpen(true)
        setActiveNotebookId(notebookId)
        // 旧版多步骤流程已废弃，这里统一回到分析列表
        setView('analysis-list')
      } else {
        console.log('🔍 [App] 检测到分析详情路径:', { path, id: rawId, analysisDetailId })
        setAnalysisDetailId(rawId)
        setView('analysis-detail')
        setActive('analysis-list')
        setAnalysisOpen(true)
      }
    } else if (path === '/CreateNote') {
      setView('category')
      setActive('creatnote')
      setCreateOpen(true)
      setAnalysisDetailId(null)
    } else if (path.startsWith('/notes/')) {
      const notebookId = path.split('/notes/')[1]
      setView('notes')
      setActiveNotebookId(notebookId)
      setNotesOpen(true)
      setAnalysisDetailId(null)
    } else if (path === '/notes') {
      setView('notes')
      setNotesOpen(true)
      setAnalysisDetailId(null)
    } else if (path === '/app') {
      setView('category')
      setActive('creatnote')
      setCreateOpen(true)
      setAnalysisDetailId(null)
    }
  }, [location.pathname])

  const handleNotebookListChange = (newList: Array<{
    notebook_id: string | null
    name: string
    description?: string | null
    note_count?: number
    created_at?: string | null
    updated_at?: string | null
  }>) => {
    setNotebooks(newList.map(nb => ({
      notebook_id: nb.notebook_id || '',
      name: nb.name,
      note_count: nb.note_count || 0,
      created_at: nb.created_at || new Date().toISOString(),
      updated_at: nb.updated_at || new Date().toISOString()
    })))
  }

  const handleRequestNotebookRefresh = () => {
    loadNotebooks()
  }

  // 不再阻塞页面渲染，允许页面立即显示
  // 加载状态和错误信息会在页面内显示，而不是全屏覆盖

  return (
    <div className="h-screen bg-[#eef6fd] text-slate-800 overflow-hidden">
      <div className="grid h-full grid-cols-[280px_1fr] gap-4 px-4 py-6">
        <aside className="h-full bg-transparent p-4 overflow-y-auto overflow-x-hidden no-scrollbar" style={{ width: '280px', minWidth: '280px' }}>
          <div className="mb-3">
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-slate-700 bg-white/70 hover:bg-white/90 hover:text-[#2B2F21] transition-colors"
              style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
            >
              <span>←</span>
              <span>返回首页</span>
            </button>
          </div>

            <button
              onClick={() => setCreateOpen(v => !v)}
              className="w-full flex items-center justify-between rounded-2xl px-3 py-2 bg-white/70 hover:bg-white/90 text-slate-800 transition-colors"
              style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
            >
              <span className="flex items-center gap-2">
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M841 822c-0.7 0.6-69 55.2-207.2-3.8-163.5-69.7-288.8-1.7-294 1.2-12.2 6.8-16.6 22.2-9.8 34.4 6.8 12.2 22.2 16.6 34.4 9.8 1.1-0.6 108.6-58.9 249.5 1.2 54.7 23.3 101 31.2 138.8 31.2 77 0 118.1-32.9 120.6-35 10.8-8.9 12.3-24.9 3.3-35.6-8.9-10.8-24.8-12.3-35.6-3.4zM529.3 488.7c-9.9-9.9-25.9-9.9-35.8 0L370.9 611.3c7.5-51.4 63.7-153.6 171.2-261.1 64-64 132-115.9 191.5-146.1 54.9-27.9 89.6-30.1 99.8-20 24.9 24.9-28.7 153.8-166.1 291.3-51.9 51.9-106.4 95.8-157.7 127.1-11.9 7.3-15.7 22.9-8.4 34.8 7.3 11.9 22.9 15.7 34.8 8.4 54.7-33.4 112.4-79.9 167.1-134.6 67.7-67.7 122.9-140.3 155.5-204.4 47.1-92.7 31.8-137.3 10.7-158.5-21.1-21.1-65.8-36.4-158.5 10.7-64.1 32.6-136.7 87.8-204.4 155.5-119 119-211.6 266.9-180.3 341.8L142 840.2c-9.9 9.9-9.9 25.9 0 35.8 4.9 4.9 11.4 7.4 17.9 7.4s13-2.5 17.9-7.4l351.5-351.5c9.9-9.9 9.9-25.9 0-35.8z" fill="#515151"></path>
              </svg>
              <span className="font-medium text-slate-700">创建</span>
            </span>
            <span className="text-slate-400">{createOpen ? '▾' : '▸'}</span>
          </button>
          
          {createOpen && (
            <nav className="mt-2 space-y-1 pl-6">
              <button
                onClick={() => {
                  setView('ai-import')
                  navigate('/ai-import')
                }}
                className={`w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 ${
                  view === 'ai-import' ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]' : 'text-slate-800 hover:bg-[#eef6fd]'
                }`}
                style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
              >
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M739.530598 294.52799l0 435.029978c0 24.048719-20.48045 43.594891-44.444235 43.594891L303.417963 773.152858l0 43.425022c0 23.963785 19.800975 43.508933 43.807738 43.508933l434.795641 0c24.006763 0 44.360324-19.545148 44.360324-43.508933L826.381665 207.551056c0-24.048719-20.35356-43.636846-44.360324-43.636846L347.224678 163.91421c-24.006763 0-43.807738 19.588127-43.807738 43.636846l0 44.147476 391.669424 0C719.051171 251.698532 739.530598 270.521227 739.530598 294.52799zM588.693218 556.539402 463.561289 674.320922c-17.334807 16.315594-44.699038 15.551184-61.142545-1.86958-16.315594-17.419741-15.508205-44.783972 1.86958-61.099566l59.357899-55.916521L241.086335 555.435255c-24.006763 0-43.468001-18.951631-43.468001-43.00035 0-24.049742 19.461237-43.020816 43.468001-43.020816l222.559888 0-59.357899-56.257282c-17.377786-16.35755-18.185174-43.934628-1.86958-61.312414 8.583492-9.007141 20.055778-13.680581 31.528064-13.680581 10.621918 0 21.24486 3.823072 29.65746 11.68411l125.08895 117.653607c12.32163 11.535731 19.37528 27.767414 19.37528 44.593638C608.068498 528.836457 601.014848 545.06814 588.693218 556.539402z" fill="#515151"></path>
              </svg>
                <span className="font-medium whitespace-nowrap">AI 导入笔记</span>
              </button>
              <button
                onClick={() => {
                  setView('category')
                  setActive('creatnote')
                  navigate('/CreateNote')
                }}
              className={`w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 ${
                view === 'category' && active === 'creatnote'
                  ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]'
                  : 'text-slate-800 hover:bg-[#eef6fd]'
              }`}
              style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
            >
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M817.56672 716.6976h-107.3408V827.904a16.55296 16.55296 0 0 1-16.54784 16.55296h-22.76864a16.55296 16.55296 0 0 1-16.54784-16.55296V716.6976H547.0208a16.55296 16.55296 0 0 1-16.54784-16.55808V677.376a16.55296 16.55296 0 0 1 16.54784-16.54784h107.3408v-111.21664a16.55296 16.55296 0 0 1 16.54784-16.55296h22.76864a16.55296 16.55296 0 0 1 16.54784 16.55296v111.21664h107.3408a16.55296 16.55296 0 0 1 16.55808 16.54784v22.76864a16.55808 16.55808 0 0 1-16.55808 16.55808zM378.368 248.5248h331.0848c73.1392 0 132.43392 59.2896 132.43392 132.42368v180.02944c0 16.0768-15.80544 18.61632-15.80544 18.61632h-13.33248c-13.95712 0-15.104-18.85184-15.104-18.85184V504.33536H223.95904v207.6928s23.1424 84.32128 88.19712 84.32128h248.04352s16.8192 1.16224 16.8192 15.03744v16.06656c0 15.70304-16.19968 17.00864-16.19968 17.00864H312.15104c-73.14432 0-132.43392-59.2896-132.43392-132.43392V247.89504m43.96032 43.008v170.6752h576.55296v-81.4592c0-78.73536-78.21312-89.21088-78.21312-89.21088H299.29984" fill="#515151"></path>
              </svg>
              <span className="font-medium">创建笔记本</span>
            </button>
            </nav>
          )}

          <div className="my-3" />

          <button
            onClick={() => setAnalysisOpen(v => !v)}
            className="w-full flex items-center justify-between rounded-xl px-3 py-2 bg-white/60 hover:bg-white/80 text-slate-800 border border-transparent transition-colors"
            style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
          >
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M575.975619 101.766095c0 18.870857-8.192 35.84-21.308952 47.542857v80.11581h213.333333a127.804952 127.804952 0 0 1 128 127.658667v425.496381a127.804952 127.804952 0 0 1-128 127.658666H256a127.804952 127.804952 0 0 1-128-127.658666V357.083429A127.804952 127.804952 0 0 1 256 229.424762h213.333333V149.308952a63.683048 63.683048 0 0 1-13.897143-77.385142 64.073143 64.073143 0 0 1 120.539429 29.842285zM256 314.514286a42.617905 42.617905 0 0 0-42.666667 42.569143v425.496381c0 23.503238 19.114667 42.520381 42.666667 42.52038h512c23.552 0 42.666667-19.017143 42.666667-42.52038V357.083429a42.617905 42.617905 0 0 0-42.666667-42.569143H256z m-170.666667 127.658666H0v255.317334h85.333333V442.172952z m853.333334 0H1024v255.317334h-85.333333V442.172952zM384 633.660952a63.878095 63.878095 0 0 0 63.975619-63.878095 63.878095 63.878095 0 0 0-63.975619-63.780571 63.878095 63.878095 0 0 0-64.024381 63.829333 63.878095 63.878095 0 0 0 64.024381 63.829333z m256 0a63.878095 63.878095 0 0 0 63.975619-63.878095 63.878095 63.878095 0 0 0-63.975619-63.780571 63.878095 63.878095 0 0 0-64.024381 63.829333 63.878095 63.878095 0 0 0 64.024381 63.829333z" fill="#515151"></path>
              </svg>
              <span className="font-medium text-slate-700">AI分析管理</span>
            </span>
            <span className="text-slate-400">{analysisOpen ? '▾' : '▸'}</span>
          </button>
          
          {analysisOpen && (
            <nav className="mt-2 space-y-1 pl-6">
              <button
                onClick={() => {
                  setView('analysis-list')
                  setActive('analysis-list')
                  navigate('/analysis')
                }}
                className={`w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 ${
                  view === 'analysis-list' && active === 'analysis-list'
                    ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]'
                    : 'text-slate-800 hover:bg-[#eef6fd]'
                }`}
                style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
              >
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M1003.44 769.616h-113.28c7.248-12.592 10.88-26.8 10.88-41.024V130.048c0-21.92-8.864-42.64-24.192-58.064A81.76 81.76 0 0 0 818.8 48h-491.04c-45.168 0.032-81.792 36.912-81.84 82.448V150.72h-61.28c-21.76 0-42.336 8.528-58.048 23.952A83.344 83.344 0 0 0 102.4 233.184v598.144c0 14.624 3.616 28.832 10.88 41.024H20.56a20.72 20.72 0 0 0 0 41.408h515.632l49.984 50.368c16.144 15.84 41.936 15.84 57.664 0 13.184-13.392 15.84-34.032 6.448-50.368h107.632a20.72 20.72 0 0 0 14.528-35.328 19.728 19.728 0 0 0-14.528-6.08h-10.88c7.264-12.592 10.88-26.8 10.88-41.024v-20.704h245.52c5.248 0 10.496-2.032 14.512-6.08 4.032-4.08 6.048-8.96 6.048-14.64 0-5.28-2.016-10.56-6.048-14.624a20.336 20.336 0 0 0-14.512-5.664zM716.8 831.36c0 10.96-4.016 21.52-11.68 29.232a41.072 41.072 0 0 1-29.04 12.192h-64.912l-68.528-69.04c-10.48-10.56-25.408-14.624-39.52-10.56l-19.344-19.488c44.352-59.296 36.704-143.36-18.144-193.296a142.64 142.64 0 0 0-192.688-0.4c-54.848 49.936-62.912 133.6-18.96 193.28a142.688 142.688 0 0 0 94.336 56.848 141.296 141.296 0 0 0 106.432-27.2l19.36 19.488c-3.632 14.224 0.4 29.648 10.496 39.808l10.464 10.56H184.24c-22.56 0-40.72-18.688-40.72-41.424V232.384c0-22.336 17.744-40.208 39.52-40.208h494.24c21.76 0 39.52 17.872 39.52 40.208v598.96z m-275.76-71.056a102.416 102.416 0 0 1-98.752 26.784c-35.488-9.328-62.896-37.36-72.592-73.088a103.968 103.968 0 0 1 26.624-99.488 101.92 101.92 0 0 1 144.72 0c40.32 40.208 40.32 105.168 0 145.792z m419.28-31.68a41.36 41.36 0 0 1-40.704 41.408H757.92V233.184c0-21.92-8.864-42.64-24.192-58.064a81.728 81.728 0 0 0-58.048-23.952H287.04V130.448a41.344 41.344 0 0 1 40.72-41.424h491.84c22.576 0 40.72 18.272 40.72 41.424v598.16z m-614.4-433.296a20.72 20.72 0 0 1-20.56-20.704c0-5.68 2.016-10.56 6.048-14.624 3.84-3.888 9.072-6.08 14.512-6.08h225.36c11.28 0 20.56 9.328 20.56 20.704 0 11.36-9.28 20.704-20.56 20.704H245.92z m143.52 164.88c5.264 0 10.496 2.432 14.512 6.08 4.032 4.064 6.064 9.344 6.064 14.624 0 5.68-2.032 10.56-6.064 14.624-3.84 3.888-9.056 6.08-14.512 6.08h-143.52c-5.648 0-10.48-2.432-14.512-6.08a20.672 20.672 0 0 1-6.048-14.624c0-5.68 2.016-10.56 6.048-14.608 3.84-3.904 9.056-6.112 14.512-6.112h143.52v0.016z m184.24-103.152c5.248 0 10.496 2.448 14.112 6.08 4.032 4.064 6.048 9.36 6.048 14.624a20.112 20.112 0 0 1-20.16 20.72H245.92c-10.88 0-20.16-9.344-20.16-20.72a20.128 20.128 0 0 1 20.16-20.704h327.76z" fill="#515151"></path>
              </svg>
              <span className="font-medium whitespace-nowrap">分析结果列表</span>
            </button>
              {analysisDetailId && (
                // 显示“笔记本名称 + 分析”，优先使用当前选中的笔记本名称
                <button
                  onClick={() => {
                    setView('analysis-detail')
                    setActive('analysis-list')
                    setAnalysisOpen(true)
                    navigate(`/analysis/${analysisDetailId}`)
                  }}
                  className={`w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 ${
                    view === 'analysis-detail' && active === 'analysis-list'
                      ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]'
                      : 'text-slate-800 hover:bg-[#eef6fd]'
                  }`}
                  style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                >
                  <span>📈</span>
                  <span className="font-medium whitespace-nowrap truncate flex-1 text-left">
                    {(() => {
                      const nbName = activeNotebookId
                        ? notebooks.find(nb => nb.notebook_id === activeNotebookId)?.name
                        : null;
                      return nbName ? `${nbName}分析` : '当前分析';
                    })()}
                  </span>
                </button>
              )}
              <button
                onClick={() => {
                  // 直接进入分析 V2 入口，让用户在页面内选择笔记本
                  navigate('/analysis/v2')
                }}
              className={`w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 ${
                view === 'analysis-setting-v2'
                  ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]'
                  : 'text-slate-800 hover:bg-[#eef6fd]'
              }`}
              style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
            >
              <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
                <path d="M460.8 448l204.8 51.2 204.8-224-76.8-64-160 185.6-211.2-57.6-204.8 268.8 76.8 64z" fill="#515151"></path>
                <path d="M160 192H64v704h441.6v-96H160zM992 691.2h-172.8V512h-96v179.2H544v89.6h179.2V960h96v-179.2h172.8z" fill="#515151"></path>
              </svg>
              <span className="font-medium whitespace-nowrap">新建分析</span>
            </button>
              <button
                onClick={() => {
                  // 同样直接进入分析 V2 入口
                  navigate('/analysis/v2')
                }}
                className="w-full h-9 flex items-center gap-2 rounded-xl px-3 min-w-0 text-slate-800 hover:bg-[#eef6fd]"
                style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
              >
                <span>🧪</span>
                <span className="font-medium whitespace-nowrap">新建分析（V2实验）</span>
              </button>
            </nav>
          )}

          <div className="my-3" />

        <button
          onClick={() => {
            setNotesOpen(v => !v)
            if (!notesOpen && !activeNotebookId) {
              if (notebooks && notebooks.length > 0) {
                  setActiveNotebookId(notebooks[0].notebook_id)
                  navigate(`/notes/${notebooks[0].notebook_id}`)
                } else {
                  navigate('/notes')
                }
              }
            }}
          className="w-full flex items-center justify-between rounded-xl px-3 py-2 bg-white/60 hover:bg-white/80 text-slate-800 border border-transparent transition-colors"
          style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
        >
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 1024 1024" className="w-4 h-4" aria-hidden="true" focusable="false">
              <path d="M940.8 166.4v179.2h32c19.2 0 38.4 19.2 38.4 38.4s-19.2 38.4-38.4 38.4h-96c32 51.2 32 121.6 0 179.2h96c19.2 0 38.4 19.2 38.4 38.4s-19.2 38.4-38.4 38.4h-32v179.2h32c19.2 0 38.4 19.2 38.4 38.4s-19.2 38.4-38.4 38.4H281.6c-128 0-198.4-153.6-134.4-256H51.2c-19.2 0-38.4-19.2-38.4-38.4s19.2-38.4 38.4-38.4h32V422.4H51.2C32 422.4 12.8 403.2 12.8 384s19.2-38.4 38.4-38.4h96c-64-102.4 6.4-256 134.4-256h691.2c19.2 0 38.4 19.2 38.4 38.4s-19.2 38.4-38.4 38.4h-32z m-198.4 256H128v179.2h614.4c19.2 0 44.8-12.8 57.6-25.6 32-38.4 32-96 0-128-19.2-12.8-38.4-25.6-57.6-25.6z m153.6 256H281.6c-19.2 0-44.8 12.8-57.6 25.6-51.2 51.2-19.2 153.6 57.6 153.6H896v-179.2z m0-332.8V166.4H281.6c-76.8 0-102.4 102.4-57.6 153.6 12.8 12.8 32 25.6 57.6 25.6H896z" fill="#515151"></path>
            </svg>
            <span className="font-medium text-slate-700">笔记本</span>
          </span>
          <span className="text-slate-400">{notesOpen ? '▾' : '▸'}</span>
        </button>
          
          {notesOpen && (
            <nav className="mt-2 space-y-1 pl-6">
              {notebooks && notebooks.length > 0 ? (
                notebooks.map(notebook => (
                  <div
                    key={notebook.notebook_id}
                    className={`group relative flex items-center gap-2 rounded-xl px-2 py-1 transition-colors ${
                      view === 'notes' && activeNotebookId === notebook.notebook_id
                        ? 'bg-[#06c3a8] text-white shadow-lg shadow-[#8de2d5]'
                        : 'text-slate-800 hover:bg-[#06c3a8] hover:text-white'
                    }`}
                    style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}
                  >
                    <button
                    onClick={() => {
                      setNavMenuOpenId(null)
                      setView('notes')
                      setActiveNotebookId(notebook.notebook_id)
                      navigate(`/notes/${notebook.notebook_id}`)
                    }}
                    className="flex-1 h-9 flex items-center gap-2 rounded-lg px-3 min-w-0 text-left focus:outline-none"
                  >
                      {NotebookIcon}
                      <span className="whitespace-nowrap flex-1 text-left truncate">{notebook.name}</span>
                    </button>
                  <div
                    className="relative"
                    onMouseEnter={() => {
                      clearNavMenuCloseTimer()
                    }}
                    onMouseLeave={() => scheduleNavMenuClose(notebook.notebook_id)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setNavMenuOpenId(current => current === notebook.notebook_id ? null : notebook.notebook_id)
                      }}
                      onMouseEnter={() => setNavMenuOpenId(notebook.notebook_id)}
                      className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
                        view === 'notes' && activeNotebookId === notebook.notebook_id
                          ? 'text-white hover:bg-white/10'
                          : 'text-white'
                      } ${navMenuOpenId === notebook.notebook_id ? 'opacity-100 visible' : 'opacity-0 group-hover:opacity-100 group-hover:visible invisible'}`}
                      title="更多操作"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {navMenuOpenId === notebook.notebook_id && (
                        <div
                          className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20"
                          onClick={(e) => e.stopPropagation()}
                          onMouseEnter={clearNavMenuCloseTimer}
                          onMouseLeave={() => scheduleNavMenuClose(notebook.notebook_id)}
                        >
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-[#eef6fd]"
                            onClick={() => handleNotebookRename(notebook.notebook_id)}
                          >
                            重命名
                          </button>
                          <button
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={() => handleNotebookDelete(notebook.notebook_id)}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 px-3 py-2" style={{ fontSize: '14px', lineHeight: '1.5', letterSpacing: '0.2px' }}>暂无笔记本</div>
              )}
            </nav>
          )}
        </aside>

        <section className="h-full px-2 min-w-0 overflow-y-auto no-scrollbar">
          {view === 'category' && active === 'creatnote' && <CreateNote />}
          {view === 'ai-import' && (
            <AINoteImportPage
              notebooks={notebooks.map(nb => ({
                notebook_id: nb.notebook_id,
                name: nb.name,
                note_count: nb.note_count
              }))}
              onNotebookListChange={handleNotebookListChange}
              onRequestNotebookRefresh={handleRequestNotebookRefresh}
            />
          )}
          {view === 'analysis-list' && active === 'analysis-list' && <AnalysisListPage />}
          {view === 'analysis-setting-v2' && (
            <AnalysisSettingV2Page notebookIdOverride={activeNotebookId} />
          )}
          {view === 'analysis-detail' && analysisDetailId && (
            <>
              {console.log('🎯 [App] 渲染分析详情页面:', { view, analysisDetailId, location: location.pathname })}
              <AnalysisDetailPage analysisIdOverride={analysisDetailId} />
            </>
          )}
          {view === 'analysis-detail' && !analysisDetailId && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-2xl mb-4">⚠️</div>
                <h2 className="text-xl font-semibold mb-2">分析ID未找到</h2>
                <p className="text-gray-600 mb-4">view: {view}, analysisDetailId: {String(analysisDetailId)}</p>
              </div>
            </div>
          )}
          {view === 'notes' && activeNotebookId && (
            <NotesPage notebookId={activeNotebookId} />
          )}
          {view === 'notes' && !activeNotebookId && (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-2xl mb-4">📝</div>
                <h2 className="text-xl font-semibold mb-2">选择笔记本</h2>
                <p className="text-gray-600 mb-4">请从左侧选择一个笔记本来查看笔记</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default App
