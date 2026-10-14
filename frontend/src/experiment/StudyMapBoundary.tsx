import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onFailure: () => void
  onRetry: () => void
}

/** Keep study progress visible when a third-party map SDK throws in React effects. */
export class StudyMapBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFailure()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="study-loading" role="alert">
      <h1>지도를 표시하지 못했어요.</h1>
      <p>잠시 후 새로고침해 주세요. 진행 기록은 같은 탭에 보관됩니다.</p>
      <button onClick={this.props.onRetry}>지도 다시 불러오기</button>
    </div>
  }
}
