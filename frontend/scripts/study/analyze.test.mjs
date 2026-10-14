import { expect, it } from 'vitest'
import { analyze, parseCsv, questions } from './analyze.mjs'
const row={session_id:'a',is_test:'false',experiment_version:'announcement-map-v2',question_version:'survey-v1',dataset_version:'national-500-v1',old_outcome:'success',new_outcome:'success',old_help:'false',new_help:'true',old_elapsed_ms:'10000',new_elapsed_ms:'20000',old_interrupted:'false',new_interrupted:'false',old_errors:'0',new_errors:'0',old_retries:'0',new_retries:'0',[questions.preference]:'공고지도',[questions.need]:'4'}
it('excludes test, duplicate, incomplete and foreign versions, preserving zero and missing data',()=>{
  const result=analyze([row,row,{...row,session_id:'test',is_test:'true'},{...row,session_id:'bad',dataset_version:'other'},{...row,session_id:'b',old_elapsed_ms:'0',new_interrupted:'true'}])
  expect(result.validResponses).toBe(2)
  expect(result.excluded).toEqual({test:1,duplicate:1,invalid:1})
  expect(result.methods.old.medianSuccessSeconds).toBe(5)
  expect(result.methods.new.normalRecords).toBe(1)
  expect(result.methods.new.unaidedSuccessRate).toBe(0)
  expect(result.newPreferenceRate).toBe(1)
  expect(analyze([]).needMean).toBeNull()
})
it('parses quoted multiline comments and escaped quotes',()=>{
  expect(parseCsv('session_id,comment\r\na,"line1\nline2, ""quote"""\r\n')).toEqual([{session_id:'a',comment:'line1\nline2, "quote"'}])
})

it('accepts Google Sheets uppercase boolean exports without losing measurement records',()=>{
  const sheetsRow=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['true','false'].includes(value)?value.toUpperCase():value]))
  expect(analyze([sheetsRow])).toEqual(analyze([row]))
  expect(analyze([{...sheetsRow,is_test:'TRUE'}]).excluded.test).toBe(1)
})

it('keeps earlier experiment versions out of the current comparison',()=>{
  const result=analyze([row,{...row,session_id:'previous',experiment_version:'announcement-map-v1'}])
  expect(result.validResponses).toBe(1)
  expect(result.excluded.invalid).toBe(1)
})
