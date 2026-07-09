import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { App } from './App'

const root = createRoot(document.getElementById('root')!)

// Commit the shell synchronously: the legacy controller (src/app.js) queries
// the DOM at import time, so it may only load after the full tree is in the
// document. Hence the dynamic import below instead of a static one.
flushSync(() => root.render(<App />))

import('../../app')
