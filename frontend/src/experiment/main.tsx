import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { StudyApp } from './StudyApp'
import '../index.css'
import './study.css'

const root = document.getElementById('root')
if (!root) throw new Error('체험 화면을 표시할 요소가 없습니다.')
createRoot(root).render(<StrictMode><BrowserRouter><StudyApp /></BrowserRouter></StrictMode>)
