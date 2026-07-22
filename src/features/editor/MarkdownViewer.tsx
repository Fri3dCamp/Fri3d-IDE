import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function MarkdownViewer({ content }: { content: string }) {
    const html = useMemo(() => DOMPurify.sanitize(marked.parse(content, { async: false })), [content])

    return (
        <div
            className="marked-viewer h-full overflow-y-auto bg-edit px-6 py-4 [&_a]:text-fg-highlight [&_a]:underline [&_code]:bg-black/20 [&_code]:px-1 [&_h1]:font-heading [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-bold [&_h3]:font-bold [&_li]:list-disc [&_li]:ms-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:bg-black/20 [&_pre]:p-2"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}
