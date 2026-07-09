import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BridgePage } from './BridgePage'

const root = createRoot(document.getElementById('root')!)

// The legacy bridge controller writes into #bridge-id / #ide-link at import
// time, so it may only load after the page is committed to the DOM.
flushSync(() => root.render(<BridgePage />))

import('../../bridge')
