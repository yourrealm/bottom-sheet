import { createContext } from 'react'

/**
 * App-wide sheet defaults set by `Provider`. Internal (not part of the public namespace): `/styled` reads it to give
 * `BottomSheet` its own default for `dialog`.
 */
export interface SheetDefaults {
  dialog?: boolean | string
}

export const DefaultsContext = createContext<SheetDefaults>({})
