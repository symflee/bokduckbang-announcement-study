import { expect, it } from 'vitest'
import { analyze, parseCsv, questions } from './analyze.mjs'
const row={session_id:'a',is_test:'false',experiment_version:'announcement-map-v9',question_version:'survey-v3',dataset_version:'national-500-v2',method_order:'old,new',old_outcome:'success',new_outcome:'success',old_completion_source:'filtered_complex',new_completion_source:'announcement_pin',ease_old:'3',ease_new:'5',old_help:'false',new_help:'true',old_help_open_count:'0',new_help_open_count:'2',old_help_at_ms:'',new_help_at_ms:'15000',old_elapsed_ms:'10000',new_elapsed_ms:'20000',old_interrupted:'false',new_interrupted:'false',old_errors:'0',new_errors:'0',old_retries:'0',new_retries:'0',[questions.preference]:'공고지도로 찾기 (두 번째 방법)',[questions.need]:'4'}
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
  const result=analyze([row,{...row,session_id:'b',new_outcome:'skipped',new_completion_source:'',ease_new:'unsure',[questions.preference]:'판단하기 어려움',[questions.need]:'판단하기 어려움'}])
  expect(result.validResponses).toBe(2)
  expect(result.highNeedRate).toBe(.5)
  expect(result.newPreferenceRate).toBe(.5)
  expect(result.needMean).toBe(4)
  expect(result.needUnsure).toBe(1)
  expect(result.methods.new.easeMean).toBe(5)
  expect(result.methods.new.easeUnsure).toBe(1)
  expect(result.methods.new.completionRate).toBe(.5)
  expect(result.byOrder['old,new'].responses).toBe(2)
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

it('separates previous responses and reversed order, retaining written reasons',()=>{
  const result=analyze([row,{...row,session_id:'v7',experiment_version:'announcement-map-v7',question_version:'survey-v2'},{...row,session_id:'reverse',method_order:'new,old'},
    {...row,session_id:'reason',[questions.reasons]:'어디를 눌러야 할지 바로 알 수 있어서',[questions.reason_text]:'다음 동작을 쉽게 알 수 있었어요.'}])
  expect(result.validResponses).toBe(2)
  expect(result.excluded.invalid).toBe(2)
  expect(result.reasons['어디를 눌러야 할지 바로 알 수 있어서']).toBe(1)
  expect(result.comments[0].reasonText).toBe('다음 동작을 쉽게 알 수 있었어요.')
})

it('separates missing hint measurements from zero and reports per-method counts and first-use timing',()=>{
  const result=analyze([row,
    {...row,session_id:'b',new_help_open_count:'1',new_help_at_ms:'18000'},
    {...row,session_id:'c',old_help_open_count:'',new_help_open_count:'',new_help_at_ms:''},
    {...row,session_id:'d',old_help_open_count:'2',new_help_open_count:'-1',new_help_at_ms:'21000'}])
  expect(result.validResponses).toBe(4)
  expect(result.methods.old).toMatchObject({helpOpenCountRecords:2,helpOpenCountMissing:1,helpOpenCountInvalid:1,
    helpOpenCountTotal:0,helpOpenCountMean:0,helpOpenCountMedian:0,helpOpenCountDistribution:{'0':2},medianFirstHelpSeconds:null})
  expect(result.methods.new).toMatchObject({helpOpenCountRecords:2,helpOpenCountMissing:1,helpOpenCountInvalid:1,
    helpOpenCountTotal:3,helpOpenCountMean:1.5,helpOpenCountMedian:1.5,helpOpenCountDistribution:{'1':1,'2':1},
    firstHelpAtRecords:2,firstHelpAtMissing:1,firstHelpAtInvalid:1,medianFirstHelpSeconds:16.5})
  const noHintFields={...row}
  delete noHintFields.new_help_open_count
  delete noHintFields.new_help_at_ms
  expect(analyze([noHintFields]).methods.new).toMatchObject({helpOpenCountMissing:1,helpOpenCountMean:null,firstHelpAtMissing:1,medianFirstHelpSeconds:null})
})
it('keeps v8 submissions separate from the new consent and onboarding version',()=>{
  expect(analyze([{...row,experiment_version:'announcement-map-v8'}]).excluded.invalid).toBe(1)
})
