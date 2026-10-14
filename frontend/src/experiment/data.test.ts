import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { announcementsByComplex, createStudyRepositories, decodeStudyDataset } from './data'

const data = decodeStudyDataset(JSON.parse(readFileSync('public/study/national-500-v2.json','utf8')))
const bounds = {southWestLat:32,southWestLng:124,northEastLat:39,northEastLng:132}
const signal = new AbortController().signal

describe('national study dataset',()=>{
  it('has the exact regional allocation, 25 Seoul districts, statuses and no live attachments',()=>{
    expect(data.snapshot.mapComplexItems).toHaveLength(500)
    expect(data.snapshot.announcementDetails).toHaveLength(30)
    const groups:Record<string,number>={}
    for (const location of Object.values(data.locations)) groups[location.group]=(groups[location.group]??0)+1
    expect(Object.values(groups).sort((a,b)=>a-b)).toEqual([10,20,40,40,60,80,250])
    expect(new Set(Object.values(data.locations).filter(l=>l.provinceCode==='11').map(l=>l.regionCode)).size).toBe(25)
    const counts:Record<string,number>={}
    for (const a of data.snapshot.announcementDetails) {counts[a.applicationStatus!]=(counts[a.applicationStatus!]??0)+1;expect(a.attachments).toEqual([])}
    expect(counts).toEqual({BEFORE_APPLICATION:10,APPLYING:16,CLOSED:4})
  })
  it('covers every region with ongoing announcements and includes unlinked and multiply linked complexes',()=>{
    const linked=announcementsByComplex(data.snapshot)
    expect(Object.keys(linked).length).toBeLessThan(500)
    expect(Object.values(linked).some(a=>a.length>1)).toBe(true)
    expect(new Set(Object.keys(linked).map(id=>data.locations[id].group)).size).toBe(7)
    const ids = new Set(data.snapshot.mapComplexItems.map(c=>String(c.complexId)))
    for (const id of Object.keys(linked)) expect(ids.has(id)).toBe(true)
  })
  it('keeps most districts empty, caps ongoing sites at five, and shows the same sparse set with either method',async()=>{
    const linked=announcementsByComplex(data.snapshot)
    const districts=new Map(Object.values(data.locations).map(l=>[l.regionCode,0]))
    for(const id of Object.keys(linked)) {
      const code=data.locations[id].regionCode
      districts.set(code,(districts.get(code)??0)+1)
    }
    const distribution=[0,1,2,3,4,5].map(count=>[...districts.values()].filter(value=>value===count).length)
    expect(Object.keys(linked)).toHaveLength(34)
    expect(distribution).toEqual([35,12,5,1,1,1])
    const current=await createStudyRepositories(data,'complexes').mapRepository.findMap({bounds,zoom:14,filters:{applicationStatuses:['BEFORE_APPLICATION','APPLYING']}},signal)
    const proposed=await createStudyRepositories(data,'announcements').mapRepository.findMap({bounds,zoom:14},signal)
    expect(current.nodes).toEqual(proposed.nodes)
  })
  it.each(['complexes','announcements'] as const)('counts unique matching complexes at every zoom in %s mode',async mode=>{
    const repo=createStudyRepositories(data,mode).mapRepository
    const individual = await repo.findMap({bounds,zoom:14},signal)
    expect(individual.representation).toBe('INDIVIDUAL')
    const expected = mode === 'complexes' ? 500 : Object.keys(announcementsByComplex(data.snapshot)).length
    expect(individual.nodes).toHaveLength(expected)
    for (const [zoom,stage] of [[8,1],[10,2],[12,3]]) {
      const result=await repo.findMap({bounds,zoom},signal)
      expect(result.resolvedStage).toBe(stage)
      if(result.representation !== 'AGGREGATE') throw new Error('Expected aggregates')
      expect(result.nodes.reduce((sum,n)=>sum+n.uniqueComplexCount,0)).toBe(expected)
      expect(result.nodes.every(n=>n.nextStage===stage+1)).toBe(true)
    }
  })
  it('keeps status-filtered aggregates and pins consistent',async()=>{
    const repo=createStudyRepositories(data,'announcements').mapRepository
    const filters={applicationStatuses:['APPLYING' as const]}
    const individual = await repo.findMap({bounds,zoom:14,filters},signal)
    const aggregate = await repo.findMap({bounds,zoom:8,filters},signal)
    expect(individual.nodes.length).toBeGreaterThan(0)
    if(aggregate.representation !== 'AGGREGATE') throw new Error('Expected aggregates')
    expect(aggregate.nodes.reduce((sum,n)=>sum+n.uniqueComplexCount,0)).toBe(individual.nodes.length)
  })
})
