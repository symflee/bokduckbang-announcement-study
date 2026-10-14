/** Analyze a Tally/Google Sheets CSV export without transmitting responses. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const questions = {
  interest:'공공주택에 얼마나 관심이 있나요?',
  ease_old:'기존 방식으로 공고를 찾기 쉬웠나요?',
  ease_new:'공고지도로 공고를 찾기 쉬웠나요?',
  preference:'어떤 방식이 더 편했나요?',
  need:'별도의 공고지도가 필요하다고 생각하나요?',
  reasons:'그렇게 선택한 이유는 무엇인가요?',
  comment:'헷갈린 점이나 바라는 점을 자유롭게 남겨 주세요.',
}
export function parseCsv(csv) {
  const rows=[]; let row=[], field='', quoted=false
  const source=csv.replace(/^\uFEFF/,'')
  for(let i=0;i<source.length;i++) {
    const c=source[i]
    if(c==='"') {
      if(quoted && source[i+1]==='"') {field+='"';i++} else quoted=!quoted
    } else if(!quoted && (c===',' || c==='\n')) {
      row.push(field);field=''
      if(c==='\n') {rows.push(row);row=[]}
    } else if(c!=='\r' || quoted) field+=c
  }
  if(quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다.')
  if(field || row.length) {row.push(field);rows.push(row)}
  const headers=rows.shift()?.map(h=>h.trim())??[]
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))
}
function number(value) {return String(value).trim()==='' ? null : Number.isFinite(Number(value)) ? Number(value) : null}
const truth = value=>String(value).toLowerCase()==='true'
const ratio = (a,b)=>b ? a/b : null
function median(values) {const v=values.toSorted((a,b)=>a-b);return v.length ? (v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2 : null}
export function analyze(rows) {
  const seen=new Set(), valid=[], excluded={test:0,duplicate:0,invalid:0}
  for(const row of rows) {
    if(truth(row.is_test)) {excluded.test++;continue}
    if(!row.session_id || row.is_test!=='false' || row.experiment_version!=='announcement-map-v1' || row.question_version!=='survey-v1' || row.dataset_version!=='national-500-v1'
      || !['success','skipped'].includes(row.old_outcome) || !['success','skipped'].includes(row.new_outcome)
      || !['기존 방식','공고지도','차이 없음','둘 다 불편함','판단하기 어려움'].includes(row[questions.preference])
      || !['1','2','3','4','5'].includes(row[questions.need])) {excluded.invalid++;continue}
    if(seen.has(row.session_id)) {excluded.duplicate++;continue}
    seen.add(row.session_id);valid.push(row)
  }
  const preference=Object.fromEntries(['기존 방식','공고지도','차이 없음','둘 다 불편함','판단하기 어려움'].map(option=>[option,valid.filter(r=>r[questions.preference]===option).length]))
  const need=valid.map(r=>Number(r[questions.need]))
  const methods={}
  for(const method of ['old','new']) {
    const normal=valid.filter(r=>r[`${method}_interrupted`]==='false' && number(r[`${method}_errors`])===0 && number(r[`${method}_retries`])===0
      && number(r[`${method}_elapsed_ms`])!==null && number(r[`${method}_elapsed_ms`])>=0 && ['true','false'].includes(r[`${method}_help`]))
    const success=normal.filter(r=>r[`${method}_outcome`]==='success')
    const unaided=success.filter(r=>r[`${method}_help`]==='false')
    methods[method]={normalRecords:normal.length,interruptedOrInvalidRecords:valid.length-normal.length,
      success:success.length,unaidedSuccess:unaided.length,unaidedSuccessRate:ratio(unaided.length,normal.length),
      helpUseRate:ratio(normal.filter(r=>truth(r[`${method}_help`])).length,normal.length),
      medianSuccessSeconds:median(success.map(r=>Number(r[`${method}_elapsed_ms`])/1000)),
      medianUnaidedSuccessSeconds:median(unaided.map(r=>Number(r[`${method}_elapsed_ms`])/1000))}
  }
  const newPreferenceRate=ratio(preference['공고지도'],valid.length)
  const highNeedRate=ratio(need.filter(n=>n>=4).length,valid.length)
  return {validResponses:valid.length,excluded,preference,newPreferenceRate,needMean:ratio(need.reduce((a,b)=>a+b,0),need.length),highNeedRate,methods,
    reviewCriteria:{enoughResponses:valid.length>=30,newPreference: newPreferenceRate===null ? null : newPreferenceRate>=.6,need:highNeedRate===null?null:highNeedRate>=.6,
      unaided:methods.old.unaidedSuccessRate===null || methods.new.unaidedSuccessRate===null?null:methods.new.unaidedSuccessRate>=methods.old.unaidedSuccessRate},
    comments:valid.filter(r=>r[questions.comment] || r[questions.reasons]).map(r=>({sessionId:r.session_id,reasons:r[questions.reasons],comment:r[questions.comment]})),
    interpretation:'기존→신규 고정 순서로 학습 효과가 포함됩니다. 사용량 증가의 인과 증거가 아닙니다. 정상 측정의 성공률·도움 사용률과 성공자 소요시간을 표시합니다.'}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) {console.error('Usage: npm run analyze:study -- path/to/tally-export.csv');process.exitCode=1}
  else console.log(JSON.stringify(analyze(parseCsv(readFileSync(process.argv[2],'utf8'))),null,2))
}
