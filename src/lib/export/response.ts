import { renderPdfBuffer } from './pdf'
import React from 'react'

export function exportXlsxResponse(args: {
  filename: string  // without extension; '.xlsx' appended
  buffer: Buffer
}): Response {
  return new Response(new Uint8Array(args.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${args.filename}.xlsx"`,
    },
  })
}

export async function exportPdfResponse(args: {
  filename: string  // without extension; '.pdf' appended
  element: React.ReactElement
}): Promise<Response> {
  const buf = await renderPdfBuffer(args.element)
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${args.filename}.pdf"`,
    },
  })
}
