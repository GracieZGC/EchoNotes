import React from 'react';
import { Notebook } from '../apiClient';

interface MoveNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetNotebookId: string) => void;
  notebooks: Notebook[];
  currentNotebookId: string;
}

const MoveNoteModal: React.FC<MoveNoteModalProps> = ({
  isOpen,
  onClose,
  onMove,
  notebooks,
  currentNotebookId
}) => {
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const targetNotebookId = formData.get('notebookId') as string;
    if (targetNotebookId && targetNotebookId !== currentNotebookId) {
      onMove(targetNotebookId);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg p-6 w-96 max-w-full mx-4"
        onClick={(e) => {
          // 避免冒泡到遮罩层关闭对话框，同时不阻止表单/选择框的默认行为
          e.stopPropagation();
        }}
      >
        <h2 className="text-xl font-bold mb-4">移动笔记</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择目标笔记本
            </label>
            <select
              name="notebookId"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#43ccb0]"
              required
            >
              <option value="">请选择笔记本</option>
              {notebooks
                .filter(notebook => notebook.notebook_id !== currentNotebookId)
                .map(notebook => (
                  <option key={notebook.notebook_id} value={notebook.notebook_id}>
                    {notebook.name} ({notebook.note_count} 个笔记)
                  </option>
                ))
              }
            </select>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#06c3a8] text-white rounded-md hover:bg-[#04b094] shadow-lg shadow-[#8de2d5] transition-colors"
            >
              移动
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MoveNoteModal;
