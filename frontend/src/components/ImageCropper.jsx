import { useEffect, useRef, useState } from 'react'
import './ImageCropper.css'

const PREVIEW_SIZE = 256
const OUTPUT_SIZE = 128

function renderToCanvas(ctx, img, size, zoom, offsetX, offsetY) {
  const ratio = size / PREVIEW_SIZE
  const baseScale = Math.max(size / img.naturalWidth, size / img.naturalHeight)
  const scale = baseScale * zoom
  const dispW = img.naturalWidth * scale
  const dispH = img.naturalHeight * scale
  const cx = size / 2 + offsetX * ratio
  const cy = size / 2 + offsetY * ratio
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, cx - dispW / 2, cy - dispH / 2, dispW, dispH)
}

function getMaxOffset(img, zoom) {
  const baseScale = Math.max(PREVIEW_SIZE / img.naturalWidth, PREVIEW_SIZE / img.naturalHeight)
  const scale = baseScale * zoom
  const dispW = img.naturalWidth * scale
  const dispH = img.naturalHeight * scale
  return {
    x: Math.max(0, (dispW - PREVIEW_SIZE) / 2),
    y: Math.max(0, (dispH - PREVIEW_SIZE) / 2),
  }
}

function clampOffset(offset, max) {
  return {
    x: Math.min(max.x, Math.max(-max.x, offset.x)),
    y: Math.min(max.y, Math.max(-max.y, offset.y)),
  }
}

// 업로드한 이미지를 1:1 비율로 위치/배율 조정한 뒤 128x128 PNG data URL로 잘라내는 모달
function ImageCropper({ file, onConfirm, onCancel }) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const dragRef = useRef(null)

  const [imageReady, setImageReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imageRef.current = img
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setImageReady(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!imageReady) return
    renderToCanvas(canvasRef.current.getContext('2d'), imageRef.current, PREVIEW_SIZE, zoom, offset.x, offset.y)
  }, [imageReady, zoom, offset])

  const handleZoomChange = (e) => {
    const z = parseFloat(e.target.value)
    setZoom(z)
    setOffset(prev => clampOffset(prev, getMaxOffset(imageRef.current, z)))
  }

  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset }
  }

  const handlePointerMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const next = { x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }
    setOffset(clampOffset(next, getMaxOffset(imageRef.current, zoom)))
  }

  const handlePointerUp = () => {
    dragRef.current = null
  }

  const handleConfirm = () => {
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = OUTPUT_SIZE
    outputCanvas.height = OUTPUT_SIZE
    renderToCanvas(outputCanvas.getContext('2d'), imageRef.current, OUTPUT_SIZE, zoom, offset.x, offset.y)
    onConfirm(outputCanvas.toDataURL('image/png'))
  }

  return (
    <div className="image-cropper-overlay">
      <div className="image-cropper-modal">
        <h3>이미지 위치 / 배율 조정</h3>
        <canvas
          ref={canvasRef}
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          className="image-cropper-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={handleZoomChange}
          className="image-cropper-zoom"
        />
        <div className="image-cropper-actions">
          <button type="button" className="image-cropper-cancel" onClick={onCancel}>취소</button>
          <button type="button" className="image-cropper-confirm" onClick={handleConfirm} disabled={!imageReady}>확인</button>
        </div>
      </div>
    </div>
  )
}

export default ImageCropper
