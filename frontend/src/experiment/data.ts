import { decodePublicHousingSnapshot, createSnapshotPublicHousingRepositories, type PublicHousingSnapshotV1 } from '../public-housing/api/snapshotPublicHousingRepository'
import { createSnapshotPublicHousingRegionRepository } from '../public-housing/api/snapshotPublicHousingRegionRepository'
import { createSnapshotIntegratedSearchRepository } from '../public-housing/api/snapshotIntegratedSearchRepository'
import type { HousingMapRepository } from '../public-housing/api/housingMapRepository'
import type { HousingMapAggregateNode } from '../public-housing/model/housingMap'
import type { RawAnnouncementDetail } from '../public-housing/model/publicHousing'
import { findCatalogRegion } from '../public-housing/model/publicHousingRegion'

export interface StudyLocation {
  regionCode: string; neighborhoodCode: string; provinceCode: string
  regionName: string; neighborhoodName: string; group: string
}
export interface StudyDataset {
  schemaVersion: 1; datasetVersion: string; asOf: string; notice: string
  locations: Record<string, StudyLocation>; snapshot: PublicHousingSnapshotV1
}
export type MapMode = 'complexes' | 'announcements'
export interface StudyAnnouncement {
  id: string; title: string; agency: string; status: 'BEFORE_APPLICATION' | 'APPLYING'; dateLabel: string
}
export function isOpen(status: string | null | undefined) { return status === 'BEFORE_APPLICATION' || status === 'APPLYING' }
export function decodeStudyDataset(value: unknown): StudyDataset {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1
    || !('datasetVersion' in value) || typeof value.datasetVersion !== 'string'
    || !('asOf' in value) || typeof value.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)
    || !('notice' in value) || typeof value.notice !== 'string'
    || !('snapshot' in value) || !('locations' in value) || !value.locations || typeof value.locations !== 'object') throw new Error('시연 데이터 형식이 올바르지 않습니다.')
  const snapshot = decodePublicHousingSnapshot(value.snapshot)
  const locations: Record<string, StudyLocation> = {}
  for (const [id, item] of Object.entries(value.locations)) {
    if (!item || typeof item !== 'object') throw new Error('시연 지역 정보가 없습니다.')
    const fields = ['regionCode','neighborhoodCode','provinceCode','regionName','neighborhoodName','group'] as const
    for (const field of fields) if (!(field in item) || typeof item[field] !== 'string') throw new Error('시연 지역 정보가 올바르지 않습니다.')
    locations[id] = item as StudyLocation
  }
  for (const complex of snapshot.mapComplexItems) if (!locations[complex.complexId]) throw new Error('단지의 시연 지역 연결이 없습니다.')
  return {schemaVersion: 1, datasetVersion: value.datasetVersion, asOf: value.asOf, notice: value.notice, locations, snapshot}
}
export async function loadStudyDataset(signal?: AbortSignal) {
  const response = await fetch('/study/national-500-v1.json', {signal})
  if (!response.ok) throw new Error('시연 데이터를 불러오지 못했습니다.')
  return decodeStudyDataset(await response.json())
}
export function announcementsByComplex(snapshot: PublicHousingSnapshotV1) {
  const result: Record<string, StudyAnnouncement[]> = {}
  for (const a of snapshot.announcementDetails) {
    if (a.applicationStatus !== 'BEFORE_APPLICATION' && a.applicationStatus !== 'APPLYING') continue
    for (const id of new Set(a.supplyRows.flatMap(row => row.complex ? [String(row.complex.complexId)] : []))) {
      (result[id] ??= []).push({id: String(a.announcementId), title: a.title ?? '모집 공고', agency: a.agency?.code ?? '', status: a.applicationStatus,
        dateLabel: `${a.applicationStatus === 'BEFORE_APPLICATION' ? '접수 시작' : '접수 마감'} ${(a.applicationStatus === 'BEFORE_APPLICATION' ? a.applicationStartAt : a.applicationEndAt)?.replaceAll('-', '.') ?? '일정 확인'}`})
    }
  }
  return result
}
export function createStudyRepositories(dataset: StudyDataset, mode: MapMode) {
  const base = createSnapshotPublicHousingRepositories(dataset.snapshot)
  const openIds = new Set(Object.keys(announcementsByComplex(dataset.snapshot)))
  const mapRepository: HousingMapRepository = {async findMap(query, signal) {
    const result = await base.mapRepository.findMap(query, signal)
    if (result.representation !== 'INDIVIDUAL') return result
    const nodes = result.nodes.filter(n => mode === 'complexes' || openIds.has(n.complexId))
    const stage = query.zoom < 9 ? 1 : query.zoom < 11 ? 2 : query.zoom < 13 ? 3 : 4
    if (stage === 4) return {...result, nodes}
    const groups = new Map<string, typeof nodes>()
    for (const node of nodes) {
      const location = dataset.locations[node.complexId]
      const code = stage === 1 ? location.provinceCode : stage === 2 ? location.regionCode : location.neighborhoodCode
      groups.set(code, [...(groups.get(code) ?? []), node])
    }
    const aggregates: HousingMapAggregateNode[] = [...groups].map(([code, members]) => ({type: 'AGGREGATE', groupKey: `STUDY_${stage}:${code}`,
      groupLabel: stage === 3 ? (findCatalogRegion(code)?.displayName.split(' ').at(-1) ?? code) : stage === 2 ? (findCatalogRegion(code)?.districtName ?? findCatalogRegion(code)?.displayName ?? code) : (findCatalogRegion(code)?.provinceName ?? code),
      latitude: members.reduce((sum,n)=>sum+n.latitude,0)/members.length,
      longitude: members.reduce((sum,n)=>sum+n.longitude,0)/members.length,
      uniqueComplexCount: members.length, nextStage: stage === 1 ? 2 : stage === 2 ? 3 : 4, expansionZoom: stage === 1 ? 10 : stage === 2 ? 12 : 14}))
    return {resolvedStage: stage, representation:'AGGREGATE', nodes: aggregates, policyVersion:'study-regions-v1', regionDatasetVersion:dataset.datasetVersion}
  }}
  return {...base, mapRepository, regionRepository: createSnapshotPublicHousingRegionRepository(dataset.snapshot), searchRepository: createSnapshotIntegratedSearchRepository(dataset.snapshot)}
}
export function currentAnnouncement(snapshot: PublicHousingSnapshotV1, id: string): RawAnnouncementDetail | undefined {
  return snapshot.announcementDetails.find(a => String(a.announcementId) === id && isOpen(a.applicationStatus))
}
