"use client"

import React from 'react'
import { motion } from 'framer-motion'

export function StepDocumentUpload({
  uploadedFiles,
  onFileChange,
  onRemoveFile,
  onBack,
  onNext
}: {
  uploadedFiles: File[]
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: (index: number) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-6"
    >
      <h1 className="text-[20px] font-semibold text-zinc-900 tracking-tight">Upload relevant documents</h1>

      <label className="relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-zinc-300 rounded-3xl bg-zinc-50 cursor-pointer hover:border-emerald-500/50 transition-colors">
        <input type="file" multiple className="hidden" onChange={onFileChange} />
        <span className="text-[14px] font-medium text-zinc-900">Drop files here</span>
        <span className="text-[12px] text-zinc-500 mt-1">or click to browse</span>
      </label>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">Uploaded Files</p>
          <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
            {uploadedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl"
              >
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[13px] font-medium text-zinc-900 truncate">{file.name}</span>
                  <span className="text-[11px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
                <button onClick={() => onRemoveFile(idx)} className="text-zinc-400 hover:text-red-500 p-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={uploadedFiles.length === 0}
          className="h-12 flex-[2] rounded-2xl bg-emerald-600 text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </motion.div>
  )
}
