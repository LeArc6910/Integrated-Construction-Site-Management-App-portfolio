import { useCallback, useEffect, useState } from 'react'
import { generateTestData, resetTestData } from '../../api/dev'
import { createTeam, listAllMembers, listTeams, setUserTeam, switchActiveTeam } from '../../api/teams'
import { useAuth } from '../../hooks/useAuth'

function TeamSection() {
  const { user } = useAuth()
  const [teams, setTeams] = useState([])
  const [members, setMembers] = useState([])
  const [viewTeamId, setViewTeamId] = useState(String(user.current_team_id))
  const [newTeamName, setNewTeamName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => Promise.all([listTeams(), listAllMembers()]), [])

  useEffect(() => {
    let ignore = false
    load()
      .then(([teamRows, memberRows]) => {
        if (ignore) return
        setTeams(teamRows)
        setMembers(memberRows)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  async function reload() {
    const [teamRows, memberRows] = await load()
    setTeams(teamRows)
    setMembers(memberRows)
  }

  // 팀을 바꾸면 모든 화면의 데이터가 달라지므로, 남아있는 화면 상태가 섞이지 않게 앱을 새로 연다
  async function handleSwitch() {
    setBusy(true)
    setError('')
    try {
      const teamId = Number(viewTeamId)
      await switchActiveTeam({ teamId: teamId === user.team_id ? null : teamId })
      window.location.assign('/personal')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await createTeam({ name: newTeamName.trim() })
      setNewTeamName('')
      setMessage('팀을 만들었습니다. 이제 가입 화면에서 이 팀을 고를 수 있습니다.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleMemberTeamChange(member, teamId) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await setUserTeam({ userId: member.id, teamId: Number(teamId) })
      setMessage(`${member.name}님의 소속 팀을 바꿨습니다. 이미 쌓인 기록은 이전 팀에 남습니다.`)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span className="section-label" style={{ marginTop: 0 }}>
        팀
      </span>
      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="auth-message notice">{message}</p>}

      <p className="text-secondary dev-help">
        팀끼리는 데이터가 전혀 보이지 않습니다. 보는 팀을 바꾸면 모든 메뉴가 그 팀 데이터로 바뀌고, 그 상태에서 입력한
        기록도 그 팀에 저장됩니다.
      </p>
      <div className="dev-row">
        <label className="text-secondary" htmlFor="dev-view-team">
          보는 팀
        </label>
        <select id="dev-view-team" value={viewTeamId} onChange={(e) => setViewTeamId(e.target.value)}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
              {team.id === user.team_id ? ' (소속)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn small primary"
          disabled={busy || Number(viewTeamId) === user.current_team_id}
          onClick={handleSwitch}
        >
          전환
        </button>
      </div>

      <div className="dev-row">
        <input
          className="dev-input"
          placeholder="새 팀 이름"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
        />
        <button type="button" className="btn small" disabled={busy || !newTeamName.trim()} onClick={handleCreateTeam}>
          팀 추가
        </button>
      </div>

      <span className="section-label">인원별 소속 팀</span>
      <div className="table">
        <div className="row head dev-member-row">
          <span>이름</span>
          <span>권한</span>
          <span>소속 팀</span>
        </div>
        {members.map((member) => (
          <div key={member.id} className="row dev-member-row">
            <span>{member.name}</span>
            <span className="text-secondary">{member.role}</span>
            <select
              value={member.team_id}
              disabled={busy}
              aria-label={`${member.name} 소속 팀`}
              onChange={(e) => handleMemberTeamChange(member, e.target.value)}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  )
}

export default function DevPage() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleGenerate() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await generateTestData()
      setMessage('임시 데이터를 생성했습니다. 현장관리 메뉴에서 확인할 수 있습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await resetTestData()
      setMessage('임시 데이터를 초기화했습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">개발자 페이지</h2>

      <TeamSection />

      <span className="section-label">테스트 데이터</span>
      {user.is_test_account ? (
        <>
          <p className="text-secondary" style={{ marginBottom: 8 }}>
            세대표·미타공이 있는 임시 현장 하나를 지금 보는 팀에 만들거나 지웁니다. is_test_data로 표시된 현장만 대상이라
            실제 현장에는 영향을 주지 않습니다.
          </p>

          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="text-secondary">{message}</p>}

          <div className="dev-actions">
            <button type="button" className="btn" disabled={busy} onClick={handleGenerate}>
              임시 데이터 생성
            </button>
            <button type="button" className="btn danger" disabled={busy} onClick={handleReset}>
              임시 데이터 초기화
            </button>
          </div>
        </>
      ) : (
        <p className="text-secondary">테스트 계정으로 로그인해야 임시 데이터 기능을 사용할 수 있습니다.</p>
      )}
    </div>
  )
}
