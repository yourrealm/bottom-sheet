import { createContext, useContext, useEffect, useState } from 'react'
import { DIALOG_QUERY } from '@yourrealm/bottom-sheet/styled'

/** A media query's current match, following changes. */
export function useMedia(query: string) {
  const [on, setOn] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const change = () => setOn(mq.matches)
    change()
    mq.addEventListener('change', change)
    return () => mq.removeEventListener('change', change)
  }, [query])
  return on
}

/** The demo's dialog setting as the sheets see it (App state: the home and top-bar switches, `?dialog=`). */
export const DialogSettingContext = createContext(true)

/** Whether modal sheets open as dialogs here: a desktop window with the dialog setting on. Follows both live. */
export function useDialogs() {
  return useMedia(DIALOG_QUERY) && useContext(DialogSettingContext)
}
