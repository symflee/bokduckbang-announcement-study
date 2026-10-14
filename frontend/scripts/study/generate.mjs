/** Reproducible, synthetic research fixtures. Never represents a real offer. */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MINIMAL_PUBLIC_HOUSING_SNAPSHOT } from '../../src/public-housing/testing/minimalPublicHousingSnapshot.ts'
const root = fileURLToPath(new URL('../../', import.meta.url))
const read = path => JSON.parse(readFileSync(root + path, 'utf8'))
const catalog = read('src/public-housing/regions/regionCatalog.json').items
const points = read('src/public-housing/regions/regionRepresentativePoints.json')
const boundaries = read('src/public-housing/regions/regionBoundaryIndex.json').regions
const districts = catalog.filter(r => r.regionCode.length === 5 && points[r.regionCode])
const groups = [
  { key: 'seoul', count: 250, ads: 10, codes: districts.filter(r => r.regionCode.startsWith('11')).map(r => r.regionCode) },
  { key: 'capital', count: 80, ads: 5, codes: ['41110','41130','41280','41360','41590','28185','28200','28290'] },
  { key: 'gangwon', count: 20, ads: 2, codes: ['51110','51130','51150','51210'] },
  { key: 'chungcheong', count: 40, ads: 4, codes: ['43110','44130','44200','30200','36110'] },
  { key: 'honam', count: 40, ads: 4, codes: ['52110','52140','12150','12330','12110'] },
  { key: 'yeongnam', count: 60, ads: 4, codes: ['26350','27290','31140','47110','48120','48170'] },
  { key: 'jeju', count: 10, ads: 1, codes: ['50110','50130'] },
]
const base = structuredClone(MINIMAL_PUBLIC_HOUSING_SNAPSHOT)
const snapshot = { version: 1, complexRegionCodes: {}, announcementRegionCodes: {}, regionCodeDescendants: {}, complexListItems: [], mapComplexItems: [], complexDetails: [], announcementListItems: [], announcementDetails: [] }
const locations = {}
const agencies = { LH: {code:'LH',name:'한국토지주택공사'}, SH:{code:'SH',name:'서울주택도시공사'}, GH:{code:'GH',name:'경기주택도시공사'} }
const kinds = ['HAPPY_HOUSING','NATIONAL_RENTAL','PERMANENT_RENTAL','PUBLIC_RENTAL_10Y','PUBLIC_RENTAL_50Y']
const names = ['행복주택','국민임대','영구임대','10년 공공임대','50년 공공임대']
const asOf = '2026-10-14'
const date = days => new Date(Date.parse(asOf+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)
function inRing(x,y,ring) { let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++) { const [xi,yi]=ring[i], [xj,yj]=ring[j]; if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside } return inside }
function inside(x,y,geo) { const polygons=geo.type==='MultiPolygon'?geo.coordinates:[geo.coordinates]; return polygons.some(p=>inRing(x,y,p[0])&&!p.slice(1).some(r=>inRing(x,y,r))) }
let nextId=10001, adIndex=0
for (const group of groups) {
  const members=[]
  for(let i=0;i<group.count;i++) {
    const code=group.codes[i%group.codes.length], region=districts.find(r=>r.regionCode===code)
    if(!region) throw new Error('Unknown district '+code)
    const townOptions=catalog.filter(r=>r.regionCode.length===10&&r.regionCode.startsWith(code.endsWith('0')?code.slice(0,4):code))
    const town=townOptions[Math.floor(i/group.codes.length)%Math.min(townOptions.length,3)]
    if(!town) throw new Error('No neighborhood '+code)
    const id=nextId++, p=points[code], index=Math.floor(i/group.codes.length)
    const boundary=boundaries.find(b=>b.regionCode===code)
    const feature=read('public'+boundary.path)
    let latitude=p.latitude, longitude=p.longitude
    // Keep synthetic sites on their district's land polygon; exact sites are fictional.
    for(let attempt=0;attempt<32;attempt++) {
      const angle=(index*2.399963+attempt*.7), radius=.004+index*.0013
      const lat=p.latitude+Math.sin(angle)*radius, lng=p.longitude+Math.cos(angle)*radius
      if(inside(lng,lat,feature.geometry)) { latitude=+lat.toFixed(6); longitude=+lng.toFixed(6); break }
    }
    const k=i%kinds.length, agency=group.key==='seoul'?agencies.SH:code.startsWith('41')?agencies.GH:agencies.LH
    const name=`${region.districtName ?? region.provinceName} 누리${index+1} ${names[k]} (예시)`
    const amount=18000000+(i%12)*6500000, rent=120000+(i%10)*35000, area=26+(i%5)*7
    const map={...base.mapComplexItems[0],complexId:id,name,latitude,longitude,rentalType:kinds[k],agency,exclusiveAreaMin:area,exclusiveAreaMax:area+10,depositMin:amount,depositMax:amount+15000000,monthlyRentMin:rent,monthlyRentMax:rent+80000,applicationStatus:null}
    const list={...base.complexListItems[0],...map,regionName:region.displayName,representativeAnnouncement:null}
    const ht={...structuredClone(base.complexDetails[0].housingTypes[0]),housingTypeId:id*10,name:`${area}A`,exclusiveArea:area,supplyArea:area+14,maintenanceFee:65000,basicRentalCondition:{deposit:amount,monthlyRent:rent,source:"체험용 예시",sourceUrl:null,collectedAt:asOf},currentSupplyConditions:[{target:k===0?'청년':'일반',deposit:amount,monthlyRent:rent,convertibleDeposit:null}]}
    const detail={...structuredClone(base.complexDetails[0]),...map,address:{regionName:region.displayName,roadAddress:`${region.displayName} 시연 위치 (가상 단지)`,latitude,longitude},completionDate:`${2015+i%10}-06-01`,totalHouseholdCount:120+(i%9)*60,totalParkingCount:100+(i%9)*50,hasElevator:true,housingTypes:[ht],currentAnnouncements:[]}
    snapshot.mapComplexItems.push(map); snapshot.complexListItems.push(list); snapshot.complexDetails.push(detail)
    snapshot.complexRegionCodes[id]=town.regionCode
    snapshot.regionCodeDescendants[code]=townOptions.map(r=>r.regionCode)
    const province=code.slice(0,2)
    snapshot.regionCodeDescendants[province]=catalog.filter(r=>r.regionCode.startsWith(province)&&r.regionCode.length>2).map(r=>r.regionCode)
    locations[id]={regionCode:code,neighborhoodCode:town.regionCode,provinceCode:province,regionName:region.displayName,neighborhoodName:town.displayName,group:group.key}
    members.push(detail)
  }
  for(let a=0;a<group.ads;a++) {
    const n=adIndex++, id=20001+n
    const closed=[9,14,20,27].includes(n), before=!closed&&[0,2,4,6,10,12,15,17,22,25].includes(n)
    const status=closed?'CLOSED':before?'BEFORE_APPLICATION':'APPLYING'
    const start=closed?-20:before?5+n%7:-3, end=closed?-10:before?10+n%7:4+n%11
    // Overlap creates multiple offers at one site; every district gets active examples.
    let selected=members.filter((_,i)=>(i%group.ads===a || i%group.ads===(a+1)%group.ads) && Math.floor(i/group.codes.length)%5!==4)
    if(group.key==='capital') selected=selected.filter(c=>c.agency.code===(a<3?'GH':'LH'))
    const rentalType=selected[0].rentalType
    selected=selected.filter(c=>c.rentalType===rentalType)
    const target=rentalType==='HAPPY_HOUSING'?'청년':'일반'
    const first=selected[0], title=`${group.key==='seoul'?'서울':first.address.regionName} ${names[kinds.indexOf(rentalType)]} ${a%2?'예비입주자':'입주자'} 모집 (예시 ${a+1})`
    const item={...base.announcementListItems[0],announcementId:id,title,agency:first.agency,rentalType,recruitmentType:a%2?'WAITLIST':'NEW',applicationStatus:status,publishedAt:date(-12),applicationStartAt:date(start),applicationEndAt:date(end),dDay:before?start:end,regionNames:[...new Set(selected.map(c=>c.address.regionName))],supplyComplexCount:selected.length,supplyHouseholdCount:selected.length*12,viewCount:0,actualCompetitionRate:null,predictedCompetitionRate:null}
    const supplyRows=selected.map((c,i)=>({ ...structuredClone(base.announcementDetails[0].supplyRows[0]),supplyRowId:id*100+i,sourceComplexName:c.name,sourceHousingTypeName:c.housingTypes[0].name,complex:{complexId:c.complexId,name:c.name,address:c.address.roadAddress,totalHouseholdCount:c.totalHouseholdCount,overviewImageUrl:null},housingType:c.housingTypes[0],occupancyExpectedYearMonth:'2027-03',totalSupplyHouseholdCount:12,targets:[{...base.announcementDetails[0].supplyRows[0].targets[0],supplyTargetId:id*100+i,target,supplyHouseholdCount:12,deposit:c.depositMin,monthlyRent:c.monthlyRentMin}]}))
    const detail={...structuredClone(base.announcementDetails[0]),...item,winnerAnnouncementAt:date(end+30),targets:[target],documentLinkUrl:null,receptionPlaces:[],schedules:[{scheduleId:id,type:'APPLICATION',name:'예시 접수 일정',startAt:date(start)+'T09:00',endAt:date(end)+'T18:00'}],attachments:[],supplyRows,competition:{actualRate:null,predictedRate:null}}
    snapshot.announcementListItems.push(item); snapshot.announcementDetails.push(detail)
    snapshot.announcementRegionCodes[id]=[...new Set(selected.map(c=>snapshot.complexRegionCodes[c.complexId]))]
    if(!closed) for(const c of selected) c.currentAnnouncements.push({announcementId:id,title,publicationType:'ORIGINAL',applicationStatus:status,targets:detail.targets,applicationStartAt:date(start),applicationEndAt:date(end),dDay:before?start:end,actualCompetitionRate:null})
  }
}
for(const detail of snapshot.complexDetails) {
  const current=detail.currentAnnouncements.sort((a,b)=>(a.applicationStatus==='APPLYING'?-1:1)-(b.applicationStatus==='APPLYING'?-1:1)||a.announcementId-b.announcementId)
  const list=snapshot.complexListItems.find(c=>c.complexId===detail.complexId)
  const map=snapshot.mapComplexItems.find(c=>c.complexId===detail.complexId)
  if(current[0]) { list.representativeAnnouncement=current[0]; map.applicationStatus=current[0].applicationStatus }
}
const output={schemaVersion:1,datasetVersion:'national-500-v1',asOf,notice:'기능 비교용 가상 단지·예시 모집 정보입니다. 실제 위치·모집 사실을 나타내지 않습니다.',source:'지역 경계·대표점: 저장소 지역 자료. 화면과 조건 구성 참고: https://bokduckbang.com/explore',locations,snapshot}
if(snapshot.complexDetails.length!==500||snapshot.announcementDetails.length!==30) throw new Error('Incorrect counts')
writeFileSync(root+'public/study/national-500-v1.json',JSON.stringify(output)+'\n')
console.log('Generated 500 complexes / 30 announcements; no live backend is used at runtime.')
