import { requireAction } from '@/lib/auth'
import ImportWizard from './_components/ImportWizard'

export default async function DirectorPoolImportPage() {
  await requireAction('director_pool', 'edit')
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · POOL CALCULATOR · IMPORT
          </div>
          <h1 className="page-title">Import Saved JSON</h1>
        </div>
      </div>
      <ImportWizard />
    </div>
  )
}
