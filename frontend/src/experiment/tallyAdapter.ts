import type { ExperimentSummary } from './state'

// Provider-specific field names are confined to this adapter. Use the same keys for Tally hidden fields.
export function tallyFields(summary:ExperimentSummary): Record<string,string> {
  const fields:Record<string,string> = {
    experiment_version:summary.experimentVersion, question_version:summary.questionVersion, dataset_version:summary.datasetVersion,
    as_of:summary.asOf, session_id:summary.sessionId, screen:summary.screen, is_test:String(summary.test),
    method_order:summary.order.join(','),
  }
  for (const key of ['old','new'] as const) {
    const trial = summary[key]
    fields[`ease_${key}`] = trial.ease === null ? '' : String(trial.ease)
    fields[`${key}_completion_source`] = trial.completionSource ?? ''
    fields[`${key}_outcome`] = trial.outcome
    fields[`${key}_success`] = String(trial.outcome === 'success')
    fields[`${key}_unaided`] = String(trial.outcome === 'success' && trial.helpAtMs === null)
    fields[`${key}_help`] = String(trial.helpAtMs !== null)
    fields[`${key}_help_reason`] = trial.helpReason ?? ''
    fields[`${key}_help_open_count`] = String(trial.hintOpens.length)
    fields[`${key}_elapsed_ms`] = String(Math.round(trial.elapsedMs))
    fields[`${key}_help_at_ms`] = trial.helpAtMs === null ? '' : String(Math.round(trial.helpAtMs))
    fields[`${key}_paths`] = trial.paths.join(',')
    fields[`${key}_interrupted`] = String(trial.interrupted)
    fields[`${key}_errors`] = String(trial.errors)
    fields[`${key}_retries`] = String(trial.retries)
  }
  return fields
}
export function tallyUrl(formId:string, summary:ExperimentSummary, embed:boolean) {
  const url = new URL(`https://tally.so/${embed ? 'embed' : 'r'}/${encodeURIComponent(formId)}`)
  for (const [key,value] of Object.entries(tallyFields(summary))) url.searchParams.set(key,value)
  if (embed) { url.searchParams.set('transparentBackground','1'); url.searchParams.set('hideTitle','1'); url.searchParams.set('alignLeft','1') }
  return url.href
}
export function parseTallyEvent(data:unknown, formId:string): {event:string; id?:string} | null {
  try {
    const message:unknown = typeof data === 'string' ? JSON.parse(data) : data
    if (!message || typeof message !== 'object' || !('event' in message) || typeof message.event !== 'string'
      || !('payload' in message) || !message.payload || typeof message.payload !== 'object'
      || !('formId' in message.payload) || message.payload.formId !== formId) return null
    const id = 'id' in message.payload && typeof message.payload.id === 'string' ? message.payload.id : undefined
    return {event:message.event,id}
  } catch { return null }
}
