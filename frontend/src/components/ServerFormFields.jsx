import { useState } from 'react'
import { API_BASE_URL } from '../api/client'
import ImageCropper from './ImageCropper'

export const PLATFORM_LABELS = {
  VANILLA: '바닐라',
  FORGE: 'Forge',
  NEOFORGE: 'NeoForge',
  FABRIC: 'Fabric',
  QUILT: 'Quilt',
}

export const EMPTY_FORM = { name: '', description: '', address: '', mcVersion: '', mcPlatform: 'VANILLA', color: null, imageBase64: null, ownerId: null, managerIds: [] }
const DEFAULT_COLOR = '#7289DA'

export const serverImageUrl = (server) =>
  server.hasImage
    ? `${API_BASE_URL}/servers/${server.id}/image`
    : `https://api.dicebear.com/7.x/identicon/svg?seed=minecraft${server.id}`

export function ServerFormFields({ form, onChange, onColorReset, imagePreviewUrl, onImageConfirm, ownerPicker, managerPicker }) {
  const [pendingFile, setPendingFile] = useState(null)

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) setPendingFile(file)
    e.target.value = ''
  }

  return (
    <>
      <div className="server-form-row">
        <label>이미지</label>
        <div className="server-form-image-picker">
          <div className="server-form-image-preview">
            {imagePreviewUrl
              ? <img src={imagePreviewUrl} alt="미리보기" />
              : <span className="material-icons">image</span>}
          </div>
          <label className="server-form-image-upload">
            이미지 선택
            <input type="file" accept="image/*" onChange={handleFileSelect} hidden />
          </label>
        </div>
      </div>
      <div className="server-form-row">
        <label>서버 이름</label>
        <input name="name" value={form.name} onChange={onChange} required />
      </div>
      <div className="server-form-row">
        <label>서버 설명</label>
        <input name="description" value={form.description} onChange={onChange} />
      </div>
      <div className="server-form-row">
        <label>연결 주소</label>
        <input name="address" value={form.address} onChange={onChange} placeholder="example.marendi.kr" required />
      </div>
      <div className="server-form-row">
        <label>Version</label>
        <input name="mcVersion" value={form.mcVersion} onChange={onChange} placeholder="1.21.1" required />
      </div>
      <div className="server-form-row">
        <label>Platform</label>
        <select name="mcPlatform" value={form.mcPlatform} onChange={onChange}>
          {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="server-form-row">
        <label>색상 (온라인일 때 카드 배경)</label>
        <div className="server-form-color-row">
          <input
            type="color"
            name="color"
            value={form.color || DEFAULT_COLOR}
            onChange={onChange}
          />
          <button type="button" className="server-form-color-reset" onClick={onColorReset}>
            리셋
          </button>
          {form.color === null && <span className="server-form-color-empty">색상 없음</span>}
        </div>
      </div>

      {ownerPicker}
      {managerPicker}

      {pendingFile && (
        <ImageCropper
          file={pendingFile}
          onConfirm={(dataUrl) => { onImageConfirm(dataUrl); setPendingFile(null) }}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </>
  )
}
