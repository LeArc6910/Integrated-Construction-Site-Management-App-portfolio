import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchHoleSetupOverview, saveSiteHoleSetup } from '../../api/holes'
import HoleSetupModal from '../sites/HoleSetupModal'

// 현장관리 → 현장 → 관리 메뉴 안에 있어 잘 안 보이던 "타공 설정"·"옵션 지정"으로 바로 가는 메뉴.
// 타공 설정은 이 화면에서 모달로 바로 열고, 옵션 지정은 세대표 칸을 눌러야 해서 그 현장 세대표를
// 옵션 지정 모드로 연다. 다 채우고 나면 개발자 페이지에서 팀별로 메뉴를 숨긴다.
const FROM_STATE = { from: '/hole-setup', fromLabel: '타공 설정으로' }

export default function HoleSetupPage() {
  const navigate = useNavigate()
  const [sites, setSites] = useState(null)
  const [editing, setEditing] = useState(null) // 타공 설정 모달을 연 현장
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let ignore = false
    fetchHoleSetupOverview()
      .then((rows) => !ignore && setSites(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [])

  async function reload() {
    setSites(await fetchHoleSetupOverview())
  }

  async function handleSave(setup) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveSiteHoleSetup({ siteId: editing.id, buildingIds: editing.buildingIds, ...setup })
      setNotice(`${editing.name} 타공 설정을 저장했습니다.`)
      setEditing(null)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const unsetSites = sites?.filter((site) => site.unsetUnits > 0).length ?? 0

  return (
    <div>
      <h2 className="page-title">타공 설정</h2>

      <p className="text-secondary hole-rule">
        현장마다 <b>타입별 타공 수</b>와 <b>옵션</b>(확장·알파룸 등 ±타공)을 정하고, 옵션이 있는 세대에 옵션을 붙여
        주세요. 타입이 없거나 타공 수가 비어 있는 세대는 <b>미설정</b>으로 표시됩니다. 현장 세대표의 [관리] 메뉴에서도
        같은 설정을 할 수 있습니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

      {sites && sites.length === 0 && <p className="text-secondary">세대표가 있는 현장이 없습니다.</p>}
      {sites && sites.length > 0 && (
        <span className="section-label">
          {unsetSites > 0 ? `미설정 세대가 남은 현장 ${unsetSites}곳 (위쪽부터)` : '모든 현장의 타공 설정이 끝났습니다.'}
        </span>
      )}

      <div className="site-list-grid">
        {sites?.map((site) => {
          const emptyTypes = site.types.filter((type) => type.hole_count == null).length
          const optionUnits = Object.values(site.optionUnitCount).reduce((sum, n) => sum + n, 0)
          return (
            <div key={site.id} className="site-card">
              <div className="hole-site-top">
                <Link to={`/sites/${site.id}`} state={FROM_STATE} className="site-card-name">
                  {site.name}
                </Link>
                {site.unsetUnits > 0 ? (
                  <span className="badge orange">미설정 {site.unsetUnits.toLocaleString()}세대</span>
                ) : (
                  <span className="badge teal">설정 완료</span>
                )}
              </div>
              <div className="site-card-stats">
                <span>
                  타입 <b className="mono">{site.types.length}</b>
                  {emptyTypes > 0 && ` (타공 수 빈 타입 ${emptyTypes})`}
                </span>
                <span>
                  옵션 <b className="mono">{site.options.length}</b>
                  {optionUnits > 0 && ` · ${optionUnits.toLocaleString()}세대 지정`}
                </span>
                <span>세대 {site.totalUnits.toLocaleString()}</span>
              </div>
              {site.sharedWith.length > 0 && (
                <p className="site-card-share">공유 세대표 · {site.sharedWith.join(', ')} 현장도 이 설정을 씁니다</p>
              )}
              <div className="site-card-actions hole-setup-actions">
                <button type="button" className="btn small" onClick={() => setEditing(site)}>
                  타공 설정
                </button>
                <button
                  type="button"
                  className="btn small"
                  disabled={site.options.length === 0}
                  title={site.options.length === 0 ? '타공 설정에서 옵션을 먼저 추가하세요' : undefined}
                  onClick={() => navigate(`/sites/${site.id}?mode=option`, { state: FROM_STATE })}
                >
                  옵션 지정
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <HoleSetupModal
          siteName={editing.name}
          types={editing.types}
          options={editing.options}
          lineCountByType={editing.lineCountByType}
          optionUnitCount={editing.optionUnitCount}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={handleSave}
        />
      )}
    </div>
  )
}
