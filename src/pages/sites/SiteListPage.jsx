import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { archiveSite, createSite, fetchSiteList, setSiteFavorite } from '../../api/sites'
import Modal from '../../components/Modal'
import { MANAGER_ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'

export default function SiteListPage() {
  const { user } = useAuth()
  const [sites, setSites] = useState(null) // null: 불러오는 중(저장해 둔 목록도 없음)
  // 저장해 둔 목록을 먼저 보여주는 동안 true. 서버에서 최신 목록이 오면 false가 된다.
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  const canDelete = MANAGER_ROLES.includes(user.role)

  function handleSearch() {
    setQuery(searchInput.trim())
  }

  const list = sites ?? []
  const filteredSites = query ? list.filter((site) => site.name.includes(query)) : list

  const load = useCallback(() => fetchSiteList({ userId: user.id }), [user.id])

  // 현장이 많으면 집계를 받는 데 시간이 걸린다. 지난번에 받아 둔 목록을 먼저 띄워 두고,
  // 서버 답이 오면 최신 목록으로 바꾼다(그 사이 숫자는 잠깐 지난번 값일 수 있다).
  useEffect(() => {
    let ignore = false
    let fresh = false
    fetchSiteList
      .peek({ userId: user.id })
      .then((rows) => {
        if (ignore || fresh || !rows) return
        setSites(rows)
        setRefreshing(true)
      })
      .catch(() => {
        // 저장해 둔 목록을 못 읽으면 서버 답만 기다린다
      })
    load()
      .then((rows) => {
        fresh = true
        if (!ignore) setSites(rows)
      })
      .catch((err) => !ignore && setError(err.message))
      .finally(() => !ignore && setRefreshing(false))
    return () => {
      ignore = true
    }
  }, [load, user.id])

  async function reload() {
    try {
      setSites(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleFavorite(site) {
    setError('')
    // 체크 반응은 즉시 보이게 하고, 실패하면 되돌린다
    setSites((prev) => prev.map((s) => (s.id === site.id ? { ...s, favorite: !s.favorite } : s)))
    try {
      await setSiteFavorite({ userId: user.id, siteId: site.id, favorite: !site.favorite })
      await reload()
    } catch (err) {
      setError(err.message)
      await reload()
    }
  }

  async function handleAddSite() {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      await createSite({ name: newName.trim() })
      setAdding(false)
      setNewName('')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSite() {
    setSaving(true)
    setError('')
    try {
      await archiveSite({ siteId: deleting.id })
      setDeleting(null)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <h2 className="page-title">
          현장 관리
          {refreshing && <span className="refresh-note">최신 내용 확인 중…</span>}
        </h2>
        <div className="site-search">
          <input
            type="text"
            placeholder="현장명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button type="button" className="btn small" onClick={handleSearch}>
            검색
          </button>
        </div>
      </div>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="site-list-grid">
        {sites === null && !error && <p className="text-secondary">불러오는 중…</p>}
        {sites?.length === 0 && <p className="text-secondary">등록된 현장이 없습니다.</p>}
        {list.length > 0 && filteredSites.length === 0 && (
          <p className="text-secondary">검색 결과가 없습니다.</p>
        )}
        {filteredSites.map((site) => (
          <div key={site.id} className="site-card">
            <div className="site-card-top">
              <label className="fav">
                <input type="checkbox" checked={site.favorite} onChange={() => handleToggleFavorite(site)} />
                즐겨찾기
              </label>
              <span className="site-card-badges">
                {site.sharedWith.length > 0 && <span className="badge share">공유</span>}
                <span className={`badge ${site.status === '완료' ? 'teal' : 'orange'}`}>{site.status}</span>
              </span>
            </div>
            <Link to={`/sites/${site.id}`} className="site-card-name">
              {site.name}
            </Link>
            <div className="site-card-stats">
              <span>
                {site.completed} / {site.total} 세대 완료
                {site.total > 0 && ` (${Math.round((site.completed / site.total) * 100)}%)`}
              </span>
              <span>미타공 {site.defectCount}건</span>
            </div>
            {/* 같은 세대표를 쓰는 현장끼리는 완료 수·미타공 건수가 같게 나오므로 이유를 적어둔다 */}
            {site.sharedWith.length > 0 && (
              <p className="site-card-share">{site.sharedWith.join(', ')} 현장과 같은 세대표를 씁니다</p>
            )}
            {canDelete && (
              <div className="site-card-actions">
                <button type="button" className="btn small danger" onClick={() => setDeleting(site)}>
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn primary" onClick={() => setAdding(true)}>
        현장 등록
      </button>

      {adding && (
        <Modal title="현장 등록" onClose={() => setAdding(false)}>
          <label>현장명</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={handleAddSite}>
              등록
            </button>
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal title="현장 삭제" onClose={() => setDeleting(null)}>
          <p>
            <b>{deleting.name}</b> 현장을 삭제할까요?
          </p>
          <p className="text-secondary">
            목록과 출역 현장 선택에서 사라집니다. 세대표·미타공·영수증 기록은 지워지지 않고 남아 있어, 필요하면 개발자가
            되돌릴 수 있습니다.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setDeleting(null)}>
              취소
            </button>
            <button type="button" className="btn danger" disabled={saving} onClick={handleDeleteSite}>
              삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
