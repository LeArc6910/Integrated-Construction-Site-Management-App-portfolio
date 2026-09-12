import { supabase } from '../lib/supabase'

// 세대표 공유는 sites.sheet_source_id 한 컬럼으로 표현된다. 값이 null이면 자기 세대표를
// 쓰는 현장이고, 값이 있으면 그 현장의 세대표(동·경량·합지·석고 시공·미타공)를 함께 본다.
export function sheetOwnerId(site) {
  return site.sheet_source_id ?? site.id
}

// 공유 설정 모달에 뿌릴 현장 목록. 한 단계 규칙(원본 1 : 참조 N) 때문에 이미 다른 관계에
// 묶인 현장은 고를 수 없어서, 걸러내지 않고 이유와 함께 내려보내 화면에서 설명한다.
export async function fetchShareCandidates({ ownerSiteId }) {
  const [sitesRes, buildingsRes] = await Promise.all([
    supabase.from('sites').select('id, name, sheet_source_id').is('archived_at', null).order('name'),
    supabase.from('buildings').select('site_id'),
  ])
  if (sitesRes.error) throw sitesRes.error
  if (buildingsRes.error) throw buildingsRes.error

  const ownerId = Number(ownerSiteId)

  const buildingCountBySite = {}
  buildingsRes.data.forEach((building) => {
    buildingCountBySite[building.site_id] = (buildingCountBySite[building.site_id] ?? 0) + 1
  })

  const ownerIdsWithFollowers = new Set(
    sitesRes.data.filter((site) => site.sheet_source_id !== null).map((site) => site.sheet_source_id)
  )

  return sitesRes.data
    .filter((site) => site.id !== ownerId)
    .map((site) => {
      const shared = site.sheet_source_id === ownerId
      let blockedReason = null
      if (!shared && site.sheet_source_id !== null) {
        blockedReason = '다른 현장의 세대표를 쓰는 중'
      } else if (ownerIdsWithFollowers.has(site.id)) {
        blockedReason = '자기 세대표를 다른 현장과 공유 중'
      }

      return {
        id: site.id,
        name: site.name,
        shared,
        blockedReason,
        ownBuildingCount: shared ? 0 : (buildingCountBySite[site.id] ?? 0),
      }
    })
}

// siteIds에 있는 현장은 ownerSiteId의 세대표를 쓰게 하고, 빠진 현장은 공유를 해제해
// 자기 세대표로 되돌린다. 해제된 현장의 기존 동·기록은 지우지 않아 그대로 다시 보인다.
//
// sites를 직접 UPDATE하지 않고 전용 함수를 호출한다. sites UPDATE는 팀장·개발자만
// 가능한데(현장 삭제가 같은 테이블의 UPDATE다) 세대표 공유는 팀원도 할 수 있어야 해서,
// sheet_source_id만 바꾸는 set_sheet_sharing으로만 길을 열어뒀다.
export async function saveSheetSharing({ ownerSiteId, siteIds }) {
  const { error } = await supabase.rpc('set_sheet_sharing', {
    owner_site_id: Number(ownerSiteId),
    site_ids: siteIds.map(Number),
  })
  if (error) throw error
}
