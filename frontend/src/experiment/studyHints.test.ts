import { describe, expect, it } from 'vitest'
import { EMPTY_HINT_CONTEXT, selectStudyHint, studyHint } from './studyHints'
describe('current situation hints',()=>{
  it('returns a stable code from the same decision as the displayed text',()=>{
    const context={...EMPTY_HINT_CONTEXT,statusFiltered:true,detail:'complex-active' as const,complexFromFilteredPin:true}
    const selected=selectStudyHint('old','complexes',context)
    expect(selected.code).toBe('open_complex_announcement')
    expect(selected.text).toBe(studyHint('old','complexes',context))
    expect(selectStudyHint('new','complexes',context).code).toBe('switch_to_announcement_map')
    expect(selectStudyHint('new','announcements',{...context,choicesOpen:true}).code).toBe('choose_announcement')
    expect(selectStudyHint('old','complexes',EMPTY_HINT_CONTEXT).code).toBe('apply_status_filter')
  })
  it('never asks to open a nonexistent announcement',()=>{
    for(const method of ['old','new'] as const) {
      const hint=studyHint(method,method==='old'?'complexes':'announcements',{...EMPTY_HINT_CONTEXT,detail:'complex-empty'})
      expect(hint).toContain('진행 중인 공고가 없어요')
      expect(hint).toContain('공고가 있는 단지')
      expect(hint).not.toContain('단지 상세의 모집공고')
    }
  })
  it('distinguishes missing filters, regional clusters, empty areas and a valid selected complex',()=>{
    expect(studyHint('old','complexes',EMPTY_HINT_CONTEXT)).toContain('모집상태를 공고중·접수중으로')
    expect(studyHint('old','complexes',{...EMPTY_HINT_CONTEXT,statusFiltered:true})).toContain('숫자가 있는 지역을 확대')
    expect(studyHint('old','complexes',{...EMPTY_HINT_CONTEXT,statusFiltered:true,mapView:'empty'})).toContain('다른 지역으로 이동')
    expect(studyHint('old','complexes',{...EMPTY_HINT_CONTEXT,statusFiltered:true,detail:'complex-active',complexFromFilteredPin:true})).toContain('단지 상세의 모집공고')
    expect(studyHint('old','complexes',{...EMPTY_HINT_CONTEXT,statusFiltered:true,detail:'complex-active'})).toContain('단지 핀을 선택')
  })
  it('keeps the map hint on the right route even after opening a list and covers multiple pins',()=>{
    expect(studyHint('new','complexes',EMPTY_HINT_CONTEXT)).toContain('이번에는 공고지도에서')
    expect(studyHint('new','announcements',{...EMPTY_HINT_CONTEXT,listOpen:true})).toContain('공고 목록이나 단지 상세 대신')
    expect(studyHint('new','announcements',{...EMPTY_HINT_CONTEXT,choicesOpen:true})).toContain('여러 공고')
    expect(studyHint('new','announcements',{...EMPTY_HINT_CONTEXT,mapView:'individual'})).toContain('요약 핀을 골라')
  })
})
