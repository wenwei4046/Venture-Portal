import { fetchItDesk, fetchItRequest, fetchMyItRequests, signItFiles } from './actions'
import { isImage, type ItRequest } from './model'

export interface ItSupportInitial {
  initialRequests: ItRequest[]
  initialRequest: ItRequest | null
  initialError?: string
  initialFileUrls: Record<string, string>
}

/** Server-rendered hosts read once before navigation completes; no automatic Server Action after mounting. */
export async function preloadItSupport(initialId?: string, desk = false): Promise<ItSupportInitial> {
  const list = await (desk ? fetchItDesk() : fetchMyItRequests())
  const initialRequests = list.ok ? list.data : []
  let initialError = list.ok ? undefined : list.error
  let initialRequest = initialRequests.find(request => request.id === initialId) ?? null
  if (initialId && !initialRequest) {
    const target = await fetchItRequest(initialId)
    if (target.ok) {
      initialRequest = target.data
      if (!target.data && !initialError) initialError = 'That request is not available.'
    } else if (!initialError) initialError = target.error
  }
  let initialFileUrls: Record<string, string> = {}
  const pictures = initialRequest?.files.filter(file => isImage(file.contentType)).map(file => file.id) ?? []
  if (pictures.length) {
    const signed = await signItFiles(pictures)
    if (signed.ok) initialFileUrls = signed.data
  }
  return { initialRequests, initialRequest, initialError, initialFileUrls }
}
