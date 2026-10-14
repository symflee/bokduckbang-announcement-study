import { expect, it } from 'vitest'
import { analyze, parseCsv, questions } from './analyze.mjs'
const row={session_id:'a',is_test:'false',experiment_version:'announcement-map-v4',question_version:'survey-v2',dataset_version:'national-500-v2',method_order:'old,new',old_outcome:'success',new_outcome:'success',old_completion_source:'filtered_complex',new_completion_source:'announcement_pin',ease_old:'3',ease_new:'5',old_help:'false',new_help:'true',old_elapsed_ms:'10000',new_elapsed_ms:'20000',old_interrupted:'false',new_interrupted:'false',old_errors:'0',new_errors:'0',old_retries:'0',new_retries:'0',[questions.preference]:'공고지도로 찾기',[questions.need]:'4'}
it('excludes test, duplicate, incomplete and previous versions; preserves zero timing',()=>{
  const result=analyze([row,row,{...row,session_id:'test',is_test:'true'},{...row,session_id:'bad',experiment_version:'announcement-map-v3'},{...row,session_id:'b',old_elapsed_ms:'0',new_interrupted:'true'}])
  expect(result.validResponses).toBe(2)
  expect(result.excluded).toEqual({test:1,duplicate:1,invalid:1})
  expect(result.methods.old.medianSuccessSeconds).toBe(5)
  expect(result.methods.new.normalRecords).toBe(1)
  expect(result.newPreferenceRate).toBe(1)
  expect(analyze([]).needMean).toBeNull()
  expect(result.reviewCriteria).not.toHaveProperty('unaided')
})
it('retains uncertain responses in preference and need denominators, and skipped trials in results',()=>{
  const result=analyze([row,{...row,session_id:'b',method_order:'new,old',new_outcome:'skipped',new_completion_source:'',ease_new:'unsure',[questions.preference]:'판단하기 어려움',[questions.need]:'판단하기 어려움'}])
  expect(result.validResponses).toBe(2)
  expect(result.highNeedRate).toBe(.5)
  expect(result.newPreferenceRate).toBe(.5)
  expect(result.needMean).toBe(4)
  expect(result.needUnsure).toBe(1)
  expect(result.methods.new.easeMean).toBe(5)
  expect(result.methods.new.easeUnsure).toBe(1)
  expect(result.methods.new.completionRate).toBe(.5)
  expect(result.byOrder['old,new'].responses).toBe(1)
  expect(result.byOrder['new,old'].responses).toBe(1)
  expect(result.byCompletion.includesSkip.responses).toBe(1)
  expect(result.byCompletion.bothCompleted.responses).toBe(1)
})
it('rejects a claimed map completion with the filter source or missing immediate ratings',()=>{
  expect(analyze([{...row,new_completion_source:'filtered_complex'}]).excluded.invalid).toBe(1)
  expect(analyze([{...row,ease_old:''}]).excluded.invalid).toBe(1)
})
it('parses quoted multiline comments and escaped quotes',()=>{
  expect(parseCsv('session_id,comment\r\na,"line1\nline2, ""quote"""\r\n')).toEqual([{session_id:'a',comment:'line1\nline2, "quote"'}])
})
it('accepts Google Sheets uppercase booleans',()=>{
  const sheets=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['true','false'].includes(value)?value.toUpperCase():value]))
  expect(analyze([sheets])).toEqual(analyze([row]))
  expect(analyze([{...sheets,is_test:'TRUE'}]).excluded.test).toBe(1)
})
