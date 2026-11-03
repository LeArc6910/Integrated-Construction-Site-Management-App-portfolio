// 작은 물음표 도움말. 마우스를 올리거나(PC) 눌러서 초점이 가면(휴대폰) 설명이 뜬다.
// 눌러도 감싼 줄의 클릭(상세 이동 등)이 일어나지 않게 막는다.
export default function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text} onClick={(e) => e.stopPropagation()}>
      !<span className="info-tip-text">{text}</span>
    </span>
  )
}
