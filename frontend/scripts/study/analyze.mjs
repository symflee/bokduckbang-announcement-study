/** Analyze a Tally/Google Sheets CSV export without transmitting responses. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const questions = {
  interest:'공공주택에 얼마나 관심이 있나요?',
  ease_old:'ease_old',
  ease_new:'ease_new',
  preference:'두 방법 중 어떤 방식을 더 선호하나요?',
  need:'모집상태 필터가 있더라도, 별도의 공고지도 탭이 필요하다고 느끼나요?',
  reasons:'그렇게 선택한 이유는 무엇인가요?',
  reason_text:'선택한 이유를 직접 적어 주세요. (선택)',
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
const booleanText = value=>String(value).trim().toLowerCase()
const truth = value=>booleanText(value)==='true'
const ratio = (a,b)=>b ? a/b : null
function median(values) {const v=values.toSorted((a,b)=>a-b);return v.length ? (v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2 : null}
const preferences=['필터로 찾기 (첫 번째 방법)','공고지도로 찾기 (두 번째 방법)','차이 없음','둘 다 불편함','판단하기 어려움']
const orders=['old,new']
const reasons=['공고 위치를 한눈에 볼 수 있어서','공고 핀에서 필요한 정보를 볼 수 있어서','모집상태 필터 조작이 편해서','모집상태 필터만으로 충분해서','핀이나 메뉴가 복잡해서','두 방법의 차이를 느끼지 못해서','어디를 눌러야 할지 바로 알 수 있어서']
const ratings=['1','2','3','4','5','unsure']
function metrics(rows) {
  const preference=Object.fromEntries(preferences.map(option=>[option,rows.filter(r=>r[questions.preference]===option).length]))
  const need=rows.map(r=>number(r[questions.need])).filter(n=>n!==null)
  const methods={}
  for(const method of ['old','new']) {
    const normal=rows.filter(r=>booleanText(r[`${method}_interrupted`])==='false' && number(r[`${method}_errors`])===0 && number(r[`${method}_retries`])===0
      && number(r[`${method}_elapsed_ms`])!==null && number(r[`${method}_elapsed_ms`])>=0)
    const completed=normal.filter(r=>r[`${method}_outcome`]==='success')
    const ease=rows.map(r=>number(r[`ease_${method}`])).filter(n=>n!==null)
    methods[method]={completed:rows.filter(r=>r[`${method}_outcome`]==='success').length,
      skipped:rows.filter(r=>r[`${method}_outcome`]==='skipped').length,
      completionRate:ratio(rows.filter(r=>r[`${method}_outcome`]==='success').length,rows.length),
      additionalHelpUseRate:ratio(rows.filter(r=>truth(r[`${method}_help`])).length,rows.length),
      normalRecords:normal.length,interruptedOrInvalidRecords:rows.length-normal.length,
      medianSuccessSeconds:median(completed.map(r=>Number(r[`${method}_elapsed_ms`])/1000)),
      easeMean:ratio(ease.reduce((a,b)=>a+b,0),ease.length),easeUnsure:rows.length-ease.length,
      easeDistribution:Object.fromEntries(ratings.map(value=>[value,rows.filter(r=>r[`ease_${method}`]===value).length]))}
  }
  return {responses:rows.length,preference,reasons:Object.fromEntries(reasons.map(reason=>[reason,rows.filter(row=>row[questions.reasons]?.includes(reason)).length])),newPreferenceRate:ratio(preference['공고지도로 찾기 (두 번째 방법)'],rows.length),
    needMean:ratio(need.reduce((a,b)=>a+b,0),need.length),needUnsure:rows.length-need.length,
    highNeedRate:ratio(need.filter(n=>n>=4).length,rows.length),methods}
}
export function analyze(rows) {
  const seen=new Set(),valid=[],excluded={test:0,duplicate:0,invalid:0}
  for(const row of rows) {
    if(truth(row.is_test)){excluded.test++;continue}
    const validMethods=['old','new'].every(method=>['success','skipped'].includes(row[`${method}_outcome`])
      && ratings.includes(row[`ease_${method}`]) && ['true','false'].includes(booleanText(row[`${method}_help`]))
      && (row[`${method}_outcome`]==='skipped' ? !row[`${method}_completion_source`]
        : row[`${method}_completion_source`]===(method==='old'?'filtered_complex':'announcement_pin')))
    if(!row.session_id || booleanText(row.is_test)!=='false' || row.experiment_version!=='announcement-map-v8'
      || row.question_version!=='survey-v3' || row.dataset_version!=='national-500-v2' || !orders.includes(row.method_order)
      || !validMethods || !preferences.includes(row[questions.preference]) || !['1','2','3','4','5','판단하기 어려움'].includes(row[questions.need])) {
      excluded.invalid++;continue
    }
    if(seen.has(row.session_id)){excluded.duplicate++;continue}
    seen.add(row.session_id);valid.push(row)
  }
  const total=metrics(valid)
  return {...total,validResponses:valid.length,excluded,
    byOrder:Object.fromEntries(orders.map(order=>[order,metrics(valid.filter(r=>r.method_order===order))])),
    byCompletion:{bothCompleted:metrics(valid.filter(r=>r.old_outcome==='success' && r.new_outcome==='success')),
      includesSkip:metrics(valid.filter(r=>r.old_outcome==='skipped' || r.new_outcome==='skipped'))},
    reviewCriteria:{enoughResponses:valid.length>=30,newPreference:total.newPreferenceRate===null?null:total.newPreferenceRate>=.6,
      need:total.highNeedRate===null?null:total.highNeedRate>=.6},
    comments:valid.filter(r=>r[questions.comment] || r[questions.reasons] || r[questions.reason_text]).map(r=>({sessionId:r.session_id,order:r.method_order,reasons:r[questions.reasons],reasonText:r[questions.reason_text],comment:r[questions.comment]})),
    interpretation:'두 방법을 설명한 뒤 직접 체험한 참여자의 선호와 필요성입니다. 필터 → 공고지도 순서로 체험하므로 학습 효과가 포함될 수 있습니다. 완료율·추가 도움·시간은 참고 지표이며 실제 사용량 증가의 증거가 아닙니다.'}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  if(!process.argv[2]) {console.error('Usage: npm run analyze:study -- path/to/tally-export.csv');process.exitCode=1}
  else console.log(JSON.stringify(analyze(parseCsv(readFileSync(process.argv[2],'utf8'))),null,2))
}
