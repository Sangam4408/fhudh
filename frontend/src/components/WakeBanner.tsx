import { useIsFetching } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

// The free Render backend sleeps when idle; the first request can take up to a minute.
const SLOW_MS = 4000

export function WakeBanner() {
  const fetching = useIsFetching() > 0
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    if (!fetching) {
      setSlow(false)
      return
    }
    const id = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(id)
  }, [fetching])

  if (!slow) return null
  return (
    <div className="wake-banner" role="status">
      Waking up the server… the free hosting tier sleeps when idle, so the first load can take up to a minute.
    </div>
  )
}
