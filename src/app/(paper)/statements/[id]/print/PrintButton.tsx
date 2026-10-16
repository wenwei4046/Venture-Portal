'use client'

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-btn no-print"
    >
      Print / Save PDF
    </button>
  )
}
