import { describe, expect, it } from 'vitest'
import { timelineWindow } from '@/lib/airshot/domain/timeline'

describe('timelineWindow', () => {
  it('sin recorte usa la duración de la escena', () => {
    expect(timelineWindow({ durationSeconds: 6 })).toEqual({ startSeconds: 0, durationSeconds: 6 })
  })

  it('con trim usa la ventana in/out', () => {
    expect(timelineWindow({ durationSeconds: 6, trimStartSeconds: 1.5, trimEndSeconds: 4 })).toEqual({ startSeconds: 1.5, durationSeconds: 2.5 })
  })

  it('trimEnd null se deriva desde trimStart', () => {
    expect(timelineWindow({ durationSeconds: 6, trimStartSeconds: 2, trimEndSeconds: null })).toEqual({ startSeconds: 2, durationSeconds: 6 })
  })
})
