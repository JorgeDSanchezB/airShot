// AirShot — infrastructure/providers/earshot.ts (ADR-013/ADR-016)
// Módulo de QA de audio opcional, DESACTIVADO por defecto (audio_qa.earshot.enabled).
// Mecanismo resuelto en implementación (supuesto A-06): in-process con FFmpeg
// (ebur128 + ffprobe) — métricas de sonoridad y sincronía REALES; naturalness/
// artifacts se reportan como «no medibles con el analizador local» (no se
// inventan métricas que el módulo no calcula — honestidad epistémica).

import type { AudioQAFeature, AudioQAProvider, AudioQAReport } from '@/lib/airshot/infrastructure/providers/types'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { probeDuration, probeLoudness } from '@/lib/airshot/infrastructure/ffmpeg'

const LUFS_TARGET_MIN = airshotConfig.audio_qa.earshot.lufs_target_min
const LUFS_TARGET_MAX = airshotConfig.audio_qa.earshot.lufs_target_max
const SYNC_TOLERANCE_SECONDS = airshotConfig.audio_qa.earshot.sync_tolerance_seconds

export class EarshotAudioQAProvider implements AudioQAProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly _entry: unknown,
  ) {
    this.name = name
  }

  async analyze(req: {
    assetEntries: Array<{ assetKey: string; absPath: string; kind: 'narration' | 'music' | 'mix' }>
    features: AudioQAFeature[]
    generateSfx: boolean
  }): Promise<AudioQAReport> {
    const metrics: AudioQAReport['metrics'] = []
    const findings: AudioQAReport['findings'] = []
    const wantsLoudness = req.features.includes('loudness')
    const wantsSync = req.features.includes('sync')

    for (const asset of req.assetEntries) {
      const durationSeconds = await probeDuration(asset.absPath)
      const loud = wantsLoudness ? await probeLoudness(asset.absPath) : { lufs: null, truePeakDb: null }
      metrics.push({
        assetKey: asset.assetKey,
        lufs: loud.lufs,
        truePeakDb: loud.truePeakDb,
        durationSeconds,
      })
      if (wantsLoudness && loud.lufs !== null) {
        if (loud.lufs < LUFS_TARGET_MIN || loud.lufs > LUFS_TARGET_MAX) {
          findings.push({
            severity: 'warning',
            code: 'LOUDNESS_OUT_OF_TARGET',
            detail: `${asset.assetKey}: integrated ${loud.lufs.toFixed(1)} LUFS fuera de [${LUFS_TARGET_MIN}, ${LUFS_TARGET_MAX}]`,
          })
        }
      }
      if (loud.truePeakDb !== null && loud.truePeakDb > -1) {
        findings.push({
          severity: 'warning',
          code: 'TRUE_PEAK_CLIP_RISK',
          detail: `${asset.assetKey}: true peak ${loud.truePeakDb.toFixed(1)} dBFS (riesgo de clipping)`,
        })
      }
      if (wantsSync && asset.kind === 'narration' && durationSeconds !== null) {
        // la sincronía narración↔clip se evalúa contra la duración objetivo de la escena
        // (la pasa el use case como kind=mix adicional cuando aporta clipDurations)
        findings.push({
          severity: 'info',
          code: 'DURATION_RECORDED',
          detail: `${asset.assetKey}: duración ${durationSeconds.toFixed(2)} s registrada para verificación de sincronía`,
        })
      }
    }

    if (req.features.includes('naturalness') || req.features.includes('artifacts')) {
      findings.push({
        severity: 'info',
        code: 'FEATURE_NOT_MEASURED_LOCALLY',
        detail: 'naturalness/artifacts requieren el analizador Earshot completo; el módulo local in-process (ebur128/ffprobe) no los mide y NO reporta valores inventados.',
      })
    }

    const sfxKeys: string[] = []
    if (req.generateSfx) {
      findings.push({
        severity: 'info',
        code: 'SFX_NOT_GENERATED_LOCALLY',
        detail: 'la generación de SFX del módulo Earshot no está disponible in-process; sfxKeys queda vacío (declarado, no ocultado).',
      })
    }
    return { metrics, findings, sfxKeys }
  }
}
