import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  ready?: boolean
  onFailure: () => void
  onRetry: () => void
}

/** Keep study progress visible when a third-party map SDK throws in React effects. */
export class StudyMapBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  private reported = false
  private loadingTimer: ReturnType<typeof setTimeout> | undefined

  private syncReadyTimer = () => {
    clearTimeout(this.loadingTimer)
    if (this.props.ready || this.state.failed) return
    // Cross-origin SDK exceptions can hide their filename; a missing viewport
    // must still stop the study from waiting indefinitely.
    this.loadingTimer = setTimeout(() => {
      this.setState({ failed: true })
      this.reportFailure()
    }, 15_000)
  }

  private reportFailure = () => {
    clearTimeout(this.loadingTimer)
    if (this.reported) return
    this.reported = true
    this.props.onFailure()
  }

  private handleSdkError = (event: ErrorEvent) => {
    // The SDK can throw after its ready callback, outside the React tree.
    if (!event.filename.startsWith('https://oapi.map.naver.com/')) return
    this.setState({ failed: true })
    this.reportFailure()
  }

  componentDidMount() {
    window.addEventListener('error', this.handleSdkError)
    this.syncReadyTimer()
  }

  componentDidUpdate(previous: Props) {
    if (previous.ready !== this.props.ready) this.syncReadyTimer()
  }

  componentWillUnmount() {
    clearTimeout(this.loadingTimer)
    window.removeEventListener('error', this.handleSdkError)
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.reportFailure()
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
