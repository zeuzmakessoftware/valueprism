'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '@/lib/utils'

function Toaster({ className, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-right"
      closeButton
      richColors
      className={cn('toaster group', className)}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:border group-[.toaster]:border-zinc-200 group-[.toaster]:bg-white group-[.toaster]:text-zinc-950 group-[.toaster]:shadow-xl',
          title: 'group-[.toast]:text-zinc-950 group-[.toast]:font-medium',
          description: 'group-[.toast]:text-zinc-500',
          actionButton: 'group-[.toast]:bg-zinc-900 group-[.toast]:text-white',
          cancelButton: 'group-[.toast]:bg-zinc-100 group-[.toast]:text-zinc-900',
          closeButton:
            'group-[.toast]:border-zinc-200 group-[.toast]:bg-white group-[.toast]:text-zinc-500'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
