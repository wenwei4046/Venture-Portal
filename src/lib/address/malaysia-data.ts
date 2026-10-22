import 'server-only'
import file from './malaysia-postcodes.json'
import type { PostcodeData } from './malaysia'

/**
 * Malaysia's postcode list, read at once — for the server, which checks every address it is sent against it
 * (`addressRefusal`). A page loads its own copy only when an address is edited (`loadMalaysia`).
 */
export const MALAYSIA_DATA: PostcodeData = file.states as unknown as PostcodeData
