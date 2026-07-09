import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BenchmarkPage } from './BenchmarkPage'

const root = createRoot(document.getElementById('root')!)

// The legacy benchmark controller queries the page DOM lazily but registers
// window.connectDevice; load it once the page is committed to the DOM to
// match the other entries.
flushSync(() => root.render(<BenchmarkPage />))

import('../../benchmark')
