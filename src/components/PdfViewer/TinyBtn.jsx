import React from 'react'
import { C } from '../takeoff/designTokens.js'

export default function TinyBtn({ children, onClick, title, style, disabled }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      padding: '5px 7px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer',
      background: 'transparent', border: 'none', color: C.muted, fontSize: 13,
      fontFamily: 'DM Mono', fontWeight: 600, opacity: disabled ? 0.3 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color 0.1s',
      ...style,
    }}>{children}</button>
  )
}
