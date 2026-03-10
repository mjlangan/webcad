import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import './index.css'
import App from './App.tsx'

const darkMq = window.matchMedia('(prefers-color-scheme: dark)')

function ThemedApp() {
  const [isDark, setIsDark] = useState(darkMq.matches)

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    darkMq.addEventListener('change', handler)
    return () => darkMq.removeEventListener('change', handler)
  }, [])

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4488ff',
          borderRadius: 3,
          fontFamily: 'system-ui, sans-serif',
        },
      }}
    >
      <App />
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>,
)
